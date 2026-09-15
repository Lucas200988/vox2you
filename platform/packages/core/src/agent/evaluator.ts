import type { Prisma } from '@vox/db'
import { z } from 'zod'
import { EvaluationScoresSchema } from '@vox/shared'
import { callJson } from './llm-json.js'
import { loadMemory, renderFacts, renderHistory } from './memory.js'
import { AgentTools } from './tools/index.js'
import type { AgentDeps } from './types.js'
import { ProductService } from '../catalog/product-service.js'
import { PromptRegistry } from '../prompts/registry.js'
import { loadAgentSettings } from '../settings/agent-settings.js'
import type { TenantContext } from '../tenant/context.js'
import { NotFoundError } from '../errors.js'

const EvalOutput = z.object({ scores: EvaluationScoresSchema, comment: z.string() })

/** AI conversation evaluator (scorecard). Human evaluations use the same Evaluation table. */
export class ConversationEvaluator {
  constructor(private readonly deps: AgentDeps) {}

  async evaluate(ctx: TenantContext, conversationId: string, outcome = 'em andamento') {
    const { db, providers, prompts } = this.deps
    const conv = await db.conversation.findFirst({ where: { id: conversationId, tenantId: ctx.tenantId }, select: { unitId: true, leadId: true } })
    if (!conv) throw new NotFoundError('Conversation', conversationId)
    const settings = await loadAgentSettings(db, conv.unitId, providers.models)
    const memory = await loadMemory(db, conversationId, 60)
    const catalog = await new ProductService(db).catalogForAgent(ctx, conv.unitId)
    const prompt = await prompts.resolve(ctx.tenantId, 'evaluate.conversation')
    const user = PromptRegistry.render(prompt.content, { history: renderHistory(memory.recent, 12000), facts: renderFacts(memory.facts), catalog_summary: AgentTools.renderCatalog(catalog), outcome })
    const res = await callJson(providers.llm, { model: settings.models.evaluate, task: 'evaluate', user, schema: EvalOutput, schemaName: 'evaluation', maxTokens: 600, temperature: 0 })
    if (!res.data) throw new Error(`Evaluation failed: ${res.parseError}`)
    const values = Object.values(res.data.scores)
    const overall = values.reduce((a, b) => a + b, 0) / values.length
    const promptVersions = await db.agentRun.findFirst({ where: { conversationId, kind: 'reply' }, orderBy: { createdAt: 'desc' }, select: { promptVersions: true } })
    return db.evaluation.create({
      data: { tenantId: ctx.tenantId, conversationId, leadId: conv.leadId, evaluatorType: 'ai', scores: res.data.scores as Prisma.InputJsonValue, overall, comment: res.data.comment, model: res.response.model, promptVersions: (promptVersions?.promptVersions ?? undefined) as Prisma.InputJsonValue | undefined },
    })
  }

  async humanEvaluate(ctx: TenantContext, conversationId: string, scores: z.infer<typeof EvaluationScoresSchema>, comment?: string) {
    const conv = await this.deps.db.conversation.findFirst({ where: { id: conversationId, tenantId: ctx.tenantId }, select: { leadId: true } })
    if (!conv) throw new NotFoundError('Conversation', conversationId)
    const parsed = EvaluationScoresSchema.parse(scores)
    const values = Object.values(parsed)
    return this.deps.db.evaluation.create({ data: { tenantId: ctx.tenantId, conversationId, leadId: conv.leadId, evaluatorType: 'human', evaluatorId: ctx.userId ?? null, scores: parsed as Prisma.InputJsonValue, overall: values.reduce((a, b) => a + b, 0) / values.length, comment: comment ?? null } })
  }
}
