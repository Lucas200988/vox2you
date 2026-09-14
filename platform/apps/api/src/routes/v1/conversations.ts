import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { ConversationModeSchema, CopilotRequestSchema, EvaluationScoresSchema, SendMessageSchema } from '@vox/shared'
import { ConversationService, ConversationEvaluator, CopilotService, OutboundService, sessionWindowRemainingMinutes } from '@vox/core'

const IdParams = z.object({ id: z.string().uuid() })

export const conversationRoutes: FastifyPluginAsync = async (app) => {
  const conversations = new ConversationService(app.ctx.db)

  app.get('/', { schema: { tags: ['inbox'], querystring: z.object({ unitId: z.string().uuid().optional(), mode: z.enum(['ai', 'human', 'paused']).optional(), status: z.enum(['open', 'closed']).optional(), assigneeId: z.string().uuid().optional(), q: z.string().optional(), limit: z.coerce.number().int().min(1).max(200).optional(), cursor: z.string().uuid().optional() }) }, preHandler: app.requireAuth('inbox:read') }, async (req) => {
    const items = await conversations.list(req.auth!, req.query as Parameters<ConversationService['list']>[1])
    return { items: items.map((c) => ({ ...c, windowRemainingMin: sessionWindowRemainingMinutes(c.lastInboundAt) })), nextCursor: items.length ? items[items.length - 1]!.id : null }
  })

  app.get('/:id', { schema: { tags: ['inbox'], params: IdParams }, preHandler: app.requireAuth('inbox:read') }, async (req) => {
    const c = await conversations.get(req.auth!, (req.params as z.infer<typeof IdParams>).id)
    return { ...c, windowRemainingMin: sessionWindowRemainingMinutes(c.lastInboundAt) }
  })

  app.get('/:id/messages', { schema: { tags: ['inbox'], params: IdParams, querystring: z.object({ limit: z.coerce.number().int().min(1).max(500).optional(), before: z.string().datetime().optional() }) }, preHandler: app.requireAuth('inbox:read') }, async (req) => {
    const q = req.query as { limit?: number; before?: string }
    const items = await conversations.messages(req.auth!, (req.params as z.infer<typeof IdParams>).id, q.limit ?? 200, q.before ? new Date(q.before) : undefined)
    return { items }
  })

  app.post('/:id/messages', { schema: { tags: ['inbox'], params: IdParams, body: SendMessageSchema }, preHandler: app.requireAuth('inbox:write') }, async (req) => {
    const outbound = new OutboundService(app.ctx.db, app.ctx.providers, app.ctx.realtime)
    const message = await outbound.send(req.auth!, (req.params as z.infer<typeof IdParams>).id, req.body as z.infer<typeof SendMessageSchema>, 'user')
    return { message }
  })

  app.post('/:id/read', { schema: { tags: ['inbox'], params: IdParams }, preHandler: app.requireAuth('inbox:read') }, async (req) => {
    await conversations.markRead(req.auth!, (req.params as z.infer<typeof IdParams>).id)
    return { ok: true }
  })

  app.post('/:id/mode', { schema: { tags: ['inbox'], params: IdParams, body: ConversationModeSchema }, preHandler: app.requireAuth('inbox:write') }, async (req) => {
    const body = req.body as z.infer<typeof ConversationModeSchema>
    const auth = req.auth!
    const updated = await conversations.setMode(auth, (req.params as z.infer<typeof IdParams>).id, body.mode, { assigneeId: body.assigneeId ?? (body.mode === 'human' ? auth.userId : undefined), reason: body.reason })
    await app.ctx.realtime.publish({ type: 'conversation.updated', tenantId: auth.tenantId, unitId: updated.unitId, conversationId: updated.id, payload: { mode: updated.mode, assigneeId: updated.assigneeId }, at: new Date().toISOString() })
    return { conversation: updated }
  })

  app.post('/:id/close', { schema: { tags: ['inbox'], params: IdParams }, preHandler: app.requireAuth('inbox:write') }, async (req) => {
    return { conversation: await conversations.close(req.auth!, (req.params as z.infer<typeof IdParams>).id) }
  })

  app.post('/:id/copilot', { schema: { tags: ['agent'], params: IdParams, body: CopilotRequestSchema.omit({ conversationId: true }) }, preHandler: app.requireAuth('inbox:write') }, async (req) => {
    const body = req.body as Omit<z.infer<typeof CopilotRequestSchema>, 'conversationId'>
    return new CopilotService(app.ctx.deps).suggest(req.auth!, (req.params as z.infer<typeof IdParams>).id, body.mode, body.draft)
  })

  app.post('/:id/evaluate', { schema: { tags: ['agent'], params: IdParams, body: z.object({ outcome: z.string().optional() }) }, preHandler: app.requireAuth('analytics:read') }, async (req) => {
    return new ConversationEvaluator(app.ctx.deps).evaluate(req.auth!, (req.params as z.infer<typeof IdParams>).id, (req.body as { outcome?: string }).outcome)
  })

  app.post('/:id/evaluations', { schema: { tags: ['agent'], params: IdParams, body: z.object({ scores: EvaluationScoresSchema, comment: z.string().optional() }) }, preHandler: app.requireAuth('inbox:write') }, async (req) => {
    const body = req.body as { scores: z.infer<typeof EvaluationScoresSchema>; comment?: string }
    return new ConversationEvaluator(app.ctx.deps).humanEvaluate(req.auth!, (req.params as z.infer<typeof IdParams>).id, body.scores, body.comment)
  })

  app.get('/:id/evaluations', { schema: { tags: ['agent'], params: IdParams }, preHandler: app.requireAuth('inbox:read') }, async (req) => {
    await conversations.get(req.auth!, (req.params as z.infer<typeof IdParams>).id)
    return { items: await app.ctx.db.evaluation.findMany({ where: { conversationId: (req.params as z.infer<typeof IdParams>).id }, orderBy: { createdAt: 'desc' }, include: { evaluator: { select: { name: true } } } }) }
  })

  app.get('/:id/runs', { schema: { tags: ['agent'], params: IdParams }, preHandler: app.requireAuth('inbox:read') }, async (req) => {
    await conversations.get(req.auth!, (req.params as z.infer<typeof IdParams>).id)
    return { items: await app.ctx.db.agentRun.findMany({ where: { conversationId: (req.params as z.infer<typeof IdParams>).id }, orderBy: { createdAt: 'desc' }, take: 50, include: { toolCalls: true } }) }
  })

  app.post('/messages/:messageId/feedback', { schema: { tags: ['agent'], params: z.object({ messageId: z.string().uuid() }), body: z.object({ rating: z.union([z.literal(1), z.literal(-1)]), reason: z.string().optional(), comment: z.string().optional() }) }, preHandler: app.requireAuth('inbox:write') }, async (req) => {
    const { messageId } = req.params as { messageId: string }
    const message = await app.ctx.db.message.findFirst({ where: { id: messageId, tenantId: req.auth!.tenantId } })
    if (!message) return app.httpErrors.notFound()
    const body = req.body as { rating: 1 | -1; reason?: string; comment?: string }
    return app.ctx.db.feedback.create({ data: { messageId, userId: req.auth!.userId ?? null, rating: body.rating, reason: body.reason ?? null, comment: body.comment ?? null } })
  })
}
