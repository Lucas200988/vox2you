import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { AgentOrchestrator, ConversationService, LeadService, NotFoundError, assertUnitAccess, type TenantContext } from '@vox/core'

const RunSchema = z.object({
  unitId: z.string().uuid(),
  text: z.string().min(1).max(4000),
  /** Existing sandbox conversation id to continue; omit to start a new one */
  conversationId: z.string().uuid().optional(),
  persona: z.string().optional(),
  promptVersion: z.number().int().optional(),
  model: z.string().optional(),
  env: z.enum(['production', 'staging']).optional(),
  facts: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
})

/**
 * Agent playground: every user gets sandbox contacts/conversations on a dedicated "playground"
 * channel. Runs are persisted as AgentRun(kind=playground) with full retrieval/tool/cost details;
 * nothing is sent to WhatsApp and CRM side effects stay inside the sandbox lead.
 */
export const playgroundRoutes: FastifyPluginAsync = async (app) => {
  const db = app.ctx.db

  async function sandboxConversation(auth: TenantContext, unitId: string, conversationId?: string) {
    assertUnitAccess(auth, unitId)
    if (conversationId) {
      const existing = await db.conversation.findFirst({ where: { id: conversationId, tenantId: auth.tenantId, channel: { kind: 'playground' } } })
      if (!existing) throw new NotFoundError('Playground conversation', conversationId)
      return existing
    }
    const channel = await db.channel.upsert({ where: { tenantId_kind_externalId: { tenantId: auth.tenantId, kind: 'playground', externalId: `playground-${unitId}` } }, update: {}, create: { tenantId: auth.tenantId, unitId, kind: 'playground', provider: 'mock', externalId: `playground-${unitId}`, name: 'Playground' } })
    const stamp = Date.now()
    return db.$transaction(async (tx) => {
      const contact = await tx.contact.create({ data: { tenantId: auth.tenantId, name: `Playground ${auth.userId?.slice(0, 6) ?? 'user'} ${stamp}`, source: 'playground', attributes: { playground: true, userId: auth.userId } } })
      await tx.contactIdentity.create({ data: { tenantId: auth.tenantId, contactId: contact.id, channel: 'playground', externalId: `pg-${contact.id}` } })
      const { conversation } = await new ConversationService(db).getOrOpen(tx, auth, { unitId, channelId: channel.id, contactId: contact.id })
      const { lead } = await new LeadService(db).getOrCreateOpen(tx, auth, { unitId, contactId: contact.id, source: 'playground' })
      return tx.conversation.update({ where: { id: conversation.id }, data: { leadId: lead.id, metadata: { playground: true } } })
    })
  }

  app.post('/run', { schema: { tags: ['agent'], body: RunSchema }, preHandler: app.requireAuth('playground:use') }, async (req) => {
    const body = req.body as z.infer<typeof RunSchema>
    const auth = req.auth!
    const conversation = await sandboxConversation(auth, body.unitId, body.conversationId)
    const conversations = new ConversationService(db)
    if (body.facts?.length && conversation.leadId) await db.$transaction((tx) => LeadService.upsertFactsTx(tx, auth, conversation.leadId!, body.facts!.map((f) => ({ ...f, source: 'confirmed' as const }))))
    const { message } = await db.$transaction((tx) => conversations.appendMessage(tx, auth, conversation.id, { direction: 'inbound', type: 'text', authorType: 'contact', text: body.text, status: 'received' }))
    const started = Date.now()
    const run = await new AgentOrchestrator(app.ctx.deps).run({ tenantId: auth.tenantId, unitId: body.unitId, conversationId: conversation.id, inboundMessageId: message.id, text: body.text, kind: 'playground', env: body.env, overrides: { persona: body.persona, promptVersion: body.promptVersion, model: body.model }, dryRun: false })
    // dryRun=false persists CRM effects inside the sandbox lead; the send step is skipped because the playground channel has no provider identity → we record the agent reply ourselves
    if (run.reply && !run.outboundMessageId) {
      await db.$transaction((tx) => conversations.appendMessage(tx, auth, conversation.id, { direction: 'outbound', type: 'text', authorType: 'agent', text: run.reply, status: 'sent', agentRunId: run.runId }))
    }
    const lead = conversation.leadId ? await db.lead.findUnique({ where: { id: conversation.leadId }, include: { facts: { where: { status: 'active' } }, stage: true, recommendedProduct: { select: { name: true } } } }) : null
    const runRow = await db.agentRun.findUnique({ where: { id: run.runId }, include: { toolCalls: true } })
    const chunks = run.sourceIds.length ? await db.knowledgeChunk.findMany({ where: { id: { in: run.sourceIds } }, select: { id: true, content: true, document: { select: { title: true, version: true, category: true } } } }) : []
    return { conversationId: conversation.id, run, runRow, lead, knowledge: chunks, wallMs: Date.now() - started }
  })

  app.get('/conversations', { schema: { tags: ['agent'], querystring: z.object({ unitId: z.string().uuid() }) }, preHandler: app.requireAuth('playground:use') }, async (req) => {
    const { unitId } = req.query as { unitId: string }
    return { items: await db.conversation.findMany({ where: { tenantId: req.auth!.tenantId, unitId, channel: { kind: 'playground' }, contact: { attributes: { path: ['userId'], equals: req.auth!.userId ?? '' } } }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, createdAt: true, lastMessagePreview: true, summary: true } }) }
  })
}
