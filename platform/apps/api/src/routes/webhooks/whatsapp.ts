import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { runWithTenant, type InboundJob } from '@vox/core'

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer
  }
}

/** phone_number_id carried by every Meta webhook payload (messages and statuses). */
function phoneNumberIdOf(body: unknown): string | null {
  const entry = (
    body as {
      entry?: Array<{ changes?: Array<{ value?: { metadata?: { phone_number_id?: string } } }> }>
    }
  )?.entry?.[0]
  return entry?.changes?.[0]?.value?.metadata?.phone_number_id ?? null
}

/**
 * Meta webhook endpoints. The POST must answer in < 50ms: it validates the HMAC signature over the
 * raw body, parses events and enqueues them (or processes inline when INBOUND_INLINE=1).
 * The app secret used for validation belongs to the tenant that owns the phone_number_id (configured
 * in Configurações → Integrações); `.env` credentials remain the fallback.
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

  const tenantOfPhoneNumber = async (phoneNumberId: string | null): Promise<string | null> => {
    if (!phoneNumberId) return null
    const channel = await app.ctx.db.channel.findUnique({
      where: { kind_externalId: { kind: 'whatsapp', externalId: phoneNumberId } },
      select: { tenantId: true, status: true },
    })
    return channel && channel.status === 'active' ? channel.tenantId : null
  }

  app.get(
    '/whatsapp',
    {
      schema: {
        tags: ['webhooks'],
        security: [],
        querystring: z.object({
          'hub.mode': z.string().optional(),
          'hub.verify_token': z.string().optional(),
          'hub.challenge': z.string().optional(),
        }),
      },
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const query = req.query as Record<string, string | undefined>
      // The handshake carries no tenant: accept the process token or any token configured in the CRM.
      let challenge = app.ctx.providers.messaging.verifyWebhook(query)
      if (
        !challenge &&
        query['hub.mode'] === 'subscribe' &&
        query['hub.verify_token'] &&
        query['hub.challenge']
      ) {
        if (await app.ctx.integrations.matchesAnyWhatsAppVerifyToken(query['hub.verify_token']))
          challenge = query['hub.challenge']
      }
      if (!challenge) return reply.status(403).send('Forbidden')
      return reply.type('text/plain').send(challenge)
    },
  )

  app.post(
    '/whatsapp',
    {
      schema: { tags: ['webhooks'], security: [] },
      config: { rateLimit: { max: 600, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const signature = req.headers['x-hub-signature-256']
      const raw = req.rawBody ?? Buffer.from('')
      const sig = typeof signature === 'string' ? signature : undefined

      const tenantId = await tenantOfPhoneNumber(phoneNumberIdOf(req.body))
      const messaging = tenantId
        ? (await app.ctx.resolver.resolve(tenantId)).providers.messaging
        : app.ctx.providers.messaging
      if (!messaging.validateSignature(raw, sig)) {
        req.log.warn({ tenantId }, 'webhook signature invalid')
        return reply.status(401).send({ error: 'invalid_signature' })
      }
      const events = messaging.parseInbound(req.body)
      if (!events.length) return reply.status(200).send({ received: 0 })

      if (app.ctx.config.INBOUND_INLINE === '1') {
        // Used by tests and single-process deployments: still respond quickly by not awaiting.
        const run = () =>
          Promise.all(
            events.map((e) =>
              app.ctx.inbound
                .process(e)
                .catch((err) => req.log.error({ err }, 'inline inbound failed')),
            ),
          )
        void (tenantId ? runWithTenant(tenantId, run) : run())
        return reply.status(200).send({ received: events.length, mode: 'inline' })
      }
      await Promise.all(
        events.map((event) => {
          const key =
            event.kind === 'message'
              ? `msg:${event.providerMessageId}`
              : `status:${event.providerMessageId}:${event.status}`
          const job: InboundJob = { key, event, receivedAt: new Date().toISOString() }
          return app.ctx.queues.inbound.add('inbound', job, {
            jobId: key.replace(/[^a-zA-Z0-9_.-]/g, '_'),
          })
        }),
      )
      return reply.status(200).send({ received: events.length })
    },
  )

  // ── Messenger + Instagram (same Meta app, object = "page" | "instagram") ──────────────────────
  const entryIdOf = (body: unknown): string | null =>
    (body as { entry?: Array<{ id?: string }> })?.entry?.[0]?.id ?? null
  const objectOf = (body: unknown): string | null => (body as { object?: string })?.object ?? null

  app.get(
    '/meta',
    {
      schema: {
        tags: ['webhooks'],
        security: [],
        querystring: z.object({
          'hub.mode': z.string().optional(),
          'hub.verify_token': z.string().optional(),
          'hub.challenge': z.string().optional(),
        }),
      },
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const query = req.query as Record<string, string | undefined>
      const ok =
        query['hub.mode'] === 'subscribe' &&
        !!query['hub.verify_token'] &&
        !!query['hub.challenge'] &&
        (await app.ctx.integrations.matchesAnyWhatsAppVerifyToken(query['hub.verify_token']))
      if (!ok) return reply.status(403).send('Forbidden')
      return reply.type('text/plain').send(query['hub.challenge'])
    },
  )

  app.post(
    '/meta',
    {
      schema: { tags: ['webhooks'], security: [] },
      config: { rateLimit: { max: 600, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const object = objectOf(req.body)
      const kind = object === 'instagram' ? 'instagram' : object === 'page' ? 'messenger' : null
      const externalId = entryIdOf(req.body)
      if (!kind || !externalId) return reply.status(200).send({ received: 0 })
      const channel = await app.ctx.db.channel.findUnique({
        where: { kind_externalId: { kind, externalId } },
        select: { tenantId: true, status: true, provider: true, externalId: true, config: true },
      })
      if (!channel || channel.status !== 'active') {
        req.log.warn({ kind, externalId }, 'meta webhook for unknown channel')
        return reply.status(200).send({ received: 0 })
      }
      const providers = (await app.ctx.resolver.resolve(channel.tenantId)).providers
      const messaging = providers.messagingFor
        ? providers.messagingFor({
            provider: channel.provider,
            externalId: channel.externalId,
            config: channel.config,
          })
        : providers.messaging
      const signature = req.headers['x-hub-signature-256']
      if (
        !messaging.validateSignature(
          req.rawBody ?? Buffer.from(''),
          typeof signature === 'string' ? signature : undefined,
        )
      ) {
        req.log.warn({ tenantId: channel.tenantId, kind }, 'meta webhook signature invalid')
        return reply.status(401).send({ error: 'invalid_signature' })
      }
      const events = messaging.parseInbound(req.body)
      if (!events.length) return reply.status(200).send({ received: 0 })
      if (app.ctx.config.INBOUND_INLINE === '1') {
        void runWithTenant(channel.tenantId, () =>
          Promise.all(
            events.map((e) =>
              app.ctx.inbound
                .process(e)
                .catch((err) => req.log.error({ err }, 'inline inbound failed')),
            ),
          ),
        )
        return reply.status(200).send({ received: events.length, mode: 'inline' })
      }
      await Promise.all(
        events.map((event) => {
          const key =
            event.kind === 'message'
              ? `msg:${event.providerMessageId}`
              : `status:${event.providerMessageId}:${event.status}`
          const job: InboundJob = { key, event, receivedAt: new Date().toISOString() }
          return app.ctx.queues.inbound.add('inbound', job, {
            jobId: key.replace(/[^a-zA-Z0-9_.-]/g, '_'),
          })
        }),
      )
      return reply.status(200).send({ received: events.length })
    },
  )
}
