import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import type { InboundJob } from '@vox/core'

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer
  }
}

/**
 * Meta webhook endpoints. The POST must answer in < 50ms: it validates the HMAC signature over the
 * raw body, parses events and enqueues them (or processes inline when INBOUND_INLINE=1).
 */
export const whatsappWebhookRoutes: FastifyPluginAsync = async (app) => {
  app.decorateRequest('rawBody', undefined)
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    req.rawBody = body as Buffer
    try {
      done(null, body.length ? JSON.parse((body as Buffer).toString('utf8')) : {})
    } catch (err) {
      done(err as Error, undefined)
    }
  })

  app.get('/whatsapp', { schema: { tags: ['webhooks'], security: [], querystring: z.object({ 'hub.mode': z.string().optional(), 'hub.verify_token': z.string().optional(), 'hub.challenge': z.string().optional() }) }, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const challenge = app.ctx.providers.messaging.verifyWebhook(req.query as Record<string, string | undefined>)
    if (!challenge) return reply.status(403).send('Forbidden')
    return reply.type('text/plain').send(challenge)
  })

  app.post('/whatsapp', { schema: { tags: ['webhooks'], security: [] }, config: { rateLimit: { max: 600, timeWindow: '1 minute' } } }, async (req, reply) => {
    const signature = req.headers['x-hub-signature-256']
    const raw = req.rawBody ?? Buffer.from('')
    if (!app.ctx.providers.messaging.validateSignature(raw, typeof signature === 'string' ? signature : undefined)) {
      req.log.warn('webhook signature invalid')
      return reply.status(401).send({ error: 'invalid_signature' })
    }
    const events = app.ctx.providers.messaging.parseInbound(req.body)
    if (!events.length) return reply.status(200).send({ received: 0 })

    if (app.ctx.config.INBOUND_INLINE === '1') {
      // Used by tests and single-process deployments: still respond quickly by not awaiting.
      void Promise.all(events.map((e) => app.ctx.inbound.process(e).catch((err) => req.log.error({ err }, 'inline inbound failed'))))
      return reply.status(200).send({ received: events.length, mode: 'inline' })
    }
    await Promise.all(
      events.map((event) => {
        const key = event.kind === 'message' ? `msg:${event.providerMessageId}` : `status:${event.providerMessageId}:${event.status}`
        const job: InboundJob = { key, event, receivedAt: new Date().toISOString() }
        return app.ctx.queues.inbound.add('inbound', job, { jobId: key.replace(/[^a-zA-Z0-9_.-]/g, '_') })
      }),
    )
    return reply.status(200).send({ received: events.length })
  })
}
