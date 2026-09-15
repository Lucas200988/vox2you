import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { AnalyticsService } from '@vox/core'

export const analyticsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/dashboard', { schema: { tags: ['analytics'], querystring: z.object({ unitId: z.string().uuid().optional(), from: z.string().datetime().optional(), to: z.string().datetime().optional() }) }, preHandler: app.requireAuth('analytics:read') }, async (req) => {
    const q = req.query as { unitId?: string; from?: string; to?: string }
    const to = q.to ? new Date(q.to) : new Date()
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - 30 * 864e5)
    return new AnalyticsService(app.ctx.db).dashboard(req.auth!, { from, to, unitId: q.unitId })
  })

  app.get('/agent-runs', { schema: { tags: ['analytics'], querystring: z.object({ limit: z.coerce.number().int().min(1).max(200).optional(), decision: z.string().optional(), kind: z.string().optional() }) }, preHandler: app.requireAuth('analytics:read') }, async (req) => {
    const q = req.query as { limit?: number; decision?: string; kind?: string }
    return { items: await app.ctx.db.agentRun.findMany({ where: { tenantId: req.auth!.tenantId, ...(q.decision ? { decision: q.decision } : {}), ...(q.kind ? { kind: q.kind } : {}) }, orderBy: { createdAt: 'desc' }, take: q.limit ?? 50, select: { id: true, kind: true, status: true, decision: true, decisionReason: true, confidence: true, retrievalScore: true, model: true, inputTokens: true, outputTokens: true, costUsd: true, latencyMs: true, createdAt: true, conversationId: true, leadId: true, classification: true, promptVersions: true } }) }
  })

  app.get('/agent-runs/:id', { schema: { tags: ['analytics'], params: z.object({ id: z.string().uuid() }) }, preHandler: app.requireAuth('inbox:read') }, async (req) => {
    const run = await app.ctx.db.agentRun.findFirst({ where: { id: (req.params as { id: string }).id, tenantId: req.auth!.tenantId }, include: { toolCalls: true } })
    if (!run) return app.httpErrors.notFound()
    const chunks = run.sourceIds.length ? await app.ctx.db.knowledgeChunk.findMany({ where: { id: { in: run.sourceIds } }, select: { id: true, content: true, document: { select: { id: true, title: true, version: true, category: true } } } }) : []
    return { run, knowledge: chunks }
  })
}
