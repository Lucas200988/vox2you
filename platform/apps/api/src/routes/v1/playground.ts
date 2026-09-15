import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  AgentOrchestrator,
  ConversationService,
  DatasetService,
  LeadService,
  openSandboxConversation,
  type TenantContext,
} from '@vox/core'

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

  const sandboxConversation = (auth: TenantContext, unitId: string, conversationId?: string) =>
    openSandboxConversation(db, auth, unitId, { conversationId })

  app.post(
    '/run',
    { schema: { tags: ['agent'], body: RunSchema }, preHandler: app.requireAuth('playground:use') },
    async (req) => {
      const body = req.body as z.infer<typeof RunSchema>
      const auth = req.auth!
      const conversation = await sandboxConversation(auth, body.unitId, body.conversationId)
      const conversations = new ConversationService(db)
      if (body.facts?.length && conversation.leadId)
        await db.$transaction((tx) =>
          LeadService.upsertFactsTx(
            tx,
            auth,
            conversation.leadId!,
            body.facts!.map((f) => ({ ...f, source: 'confirmed' as const })),
          ),
        )
      const { message } = await db.$transaction((tx) =>
        conversations.appendMessage(tx, auth, conversation.id, {
          direction: 'inbound',
          type: 'text',
          authorType: 'contact',
          text: body.text,
          status: 'received',
        }),
      )
      const started = Date.now()
      const run = await new AgentOrchestrator(app.ctx.deps).run({
        tenantId: auth.tenantId,
        unitId: body.unitId,
        conversationId: conversation.id,
        inboundMessageId: message.id,
        text: body.text,
        kind: 'playground',
        env: body.env,
        overrides: { persona: body.persona, promptVersion: body.promptVersion, model: body.model },
        dryRun: false,
      })
      // dryRun=false persists CRM effects inside the sandbox lead; the send step is skipped because the playground channel has no provider identity → we record the agent reply ourselves
      if (run.reply && !run.outboundMessageId) {
        await db.$transaction((tx) =>
          conversations.appendMessage(tx, auth, conversation.id, {
            direction: 'outbound',
            type: 'text',
            authorType: 'agent',
            text: run.reply,
            status: 'sent',
            agentRunId: run.runId,
          }),
        )
      }
      const lead = conversation.leadId
        ? await db.lead.findUnique({
            where: { id: conversation.leadId },
            include: {
              facts: { where: { status: 'active' } },
              stage: true,
              recommendedProduct: { select: { name: true } },
            },
          })
        : null
      const runRow = await db.agentRun.findUnique({
        where: { id: run.runId },
        include: { toolCalls: true },
      })
      const chunks = run.sourceIds.length
        ? await db.knowledgeChunk.findMany({
            where: { id: { in: run.sourceIds } },
            select: {
              id: true,
              content: true,
              document: { select: { title: true, version: true, category: true } },
            },
          })
        : []
      return {
        conversationId: conversation.id,
        run,
        runRow,
        lead,
        knowledge: chunks,
        wallMs: Date.now() - started,
      }
    },
  )

  app.get(
    '/conversations',
    {
      schema: { tags: ['agent'], querystring: z.object({ unitId: z.string().uuid() }) },
      preHandler: app.requireAuth('playground:use'),
    },
    async (req) => {
      const { unitId } = req.query as { unitId: string }
      return {
        items: await db.conversation.findMany({
          where: {
            tenantId: req.auth!.tenantId,
            unitId,
            channel: { kind: 'playground' },
            contact: { attributes: { path: ['userId'], equals: req.auth!.userId ?? '' } },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { id: true, createdAt: true, lastMessagePreview: true, summary: true },
        }),
      }
    },
  )

  const ConfigSchema = z.object({
    label: z.string().max(40).optional(),
    promptVersion: z.number().int().optional(),
    model: z.string().optional(),
    persona: z.string().optional(),
    env: z.enum(['production', 'staging']).optional(),
  })

  /** A/B: the same customer turn against two configurations, in two fresh sandbox conversations. */
  app.post(
    '/compare',
    {
      schema: {
        tags: ['agent'],
        body: z.object({
          unitId: z.string().uuid(),
          text: z.string().min(1).max(4000),
          facts: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
          history: z.array(z.string().max(4000)).max(10).optional(),
          a: ConfigSchema.default({}),
          b: ConfigSchema.default({}),
        }),
      },
      preHandler: app.requireAuth('playground:use'),
    },
    async (req) => {
      const body = req.body as {
        unitId: string
        text: string
        facts?: Array<{ key: string; value: string }>
        history?: string[]
        a: z.infer<typeof ConfigSchema>
        b: z.infer<typeof ConfigSchema>
      }
      const datasets = new DatasetService(db, app.ctx.deps)
      const input = { text: body.text, facts: body.facts, history: body.history }
      const [a, b] = [
        await datasets.runTurn(req.auth!, { unitId: body.unitId, label: 'A', ...body.a }, input),
        await datasets.runTurn(req.auth!, { unitId: body.unitId, label: 'B', ...body.b }, input),
      ]
      const pick = (r: typeof a) => ({
        conversationId: r.conversation.id,
        reply: r.run.reply,
        decision: r.run.decision,
        decisionReason: r.run.decisionReason,
        intent: r.run.classification?.intent ?? null,
        confidence: r.run.confidence,
        latencyMs: r.run.latencyMs,
        costUsd: r.run.usage.costUsd,
        model: r.run.model,
        validation: r.run.validation,
        stage: r.run.stage,
        score: r.run.score,
      })
      return { a: pick(a), b: pick(b), same: (a.run.reply ?? '') === (b.run.reply ?? '') }
    },
  )
}
