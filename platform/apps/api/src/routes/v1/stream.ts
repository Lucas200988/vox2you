import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { canAccessUnit } from '@vox/core'
import { subscribeRealtime } from '@vox/providers'

/** Server-Sent Events stream of realtime inbox/lead updates for the caller's tenant. */
export const streamRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { schema: { tags: ['inbox'], querystring: z.object({ unitId: z.string().uuid().optional() }) }, preHandler: app.requireAuth('inbox:read'), config: { rateLimit: false } }, async (req, reply) => {
    const auth = req.auth!
    const { unitId } = req.query as { unitId?: string }
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no', 'Access-Control-Allow-Origin': app.ctx.config.WEB_ORIGIN.split(',')[0] ?? '*', 'Access-Control-Allow-Credentials': 'true' })
    reply.raw.write(`event: ready\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`)
    const heartbeat = setInterval(() => reply.raw.write(': ping\n\n'), 25_000)
    const unsubscribe = subscribeRealtime(app.ctx.config.REDIS_URL, auth.tenantId, (event) => {
      if (event.unitId && !canAccessUnit(auth, event.unitId)) return
      if (unitId && event.unitId && event.unitId !== unitId) return
      reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    })
    const cleanup = () => {
      clearInterval(heartbeat)
      void unsubscribe()
    }
    req.raw.on('close', cleanup)
    req.raw.on('error', cleanup)
    await new Promise<void>((resolve) => req.raw.on('close', () => resolve()))
    return reply
  })
}
