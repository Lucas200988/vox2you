import type { FastifyPluginAsync } from 'fastify'

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', { schema: { tags: ['system'], security: [] } }, async () => ({ ok: true, ts: new Date().toISOString() }))
  app.get('/ready', { schema: { tags: ['system'], security: [] } }, async (_req, reply) => {
    const checks: Record<string, 'ok' | 'fail'> = {}
    try {
      await app.ctx.db.$queryRawUnsafe('SELECT 1')
      checks['database'] = 'ok'
    } catch {
      checks['database'] = 'fail'
    }
    try {
      await app.ctx.redis.ping()
      checks['redis'] = 'ok'
    } catch {
      checks['redis'] = 'fail'
    }
    const ok = Object.values(checks).every((v) => v === 'ok')
    return reply.status(ok ? 200 : 503).send({ ok, checks, providers: app.ctx.providerStatus })
  })
}
