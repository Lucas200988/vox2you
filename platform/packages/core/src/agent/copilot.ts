import type { Prisma } from '@vox/db'
import { CopilotSuggestionSchema, type CopilotSuggestion } from '@vox/shared'
import { callJson } from './llm-json.js'
import { loadMemory, renderFacts, renderHistory } from './memory.js'
import { AgentTools } from './tools/index.js'
import type { AgentDeps } from './types.js'
import { ProductService } from '../catalog/product-service.js'
import { KnowledgeSearchService } from '../knowledge/search-service.js'
import { PromptRegistry } from '../prompts/registry.js'
import { SalesBrainService } from '../sales-brain/service.js'
import { loadAgentSettings } from '../settings/agent-settings.js'
import type { TenantContext } from '../tenant/context.js'
import { assertUnitAccess } from '../tenant/context.js'
import { NotFoundError } from '../errors.js'

/**
 * Seller copilot. Produces suggestions only — nothing is sent without an explicit human action.
 */
export class CopilotService {
  constructor(private readonly deps: AgentDeps) {}

  async suggest(
    ctx: TenantContext,
    conversationId: string,
    mode: 'suggest' | 'improve' | 'summarize' | 'next_action',
    draft?: string,
  ): Promise<CopilotSuggestion & { runId: string; costUsd: number }> {
    const { db, providers, prompts } = this.deps
    const conv = await db.conversation.findFirst({
      where: { id: conversationId, tenantId: ctx.tenantId },
      select: { unitId: true, unit: { select: { timezone: true } } },
    })
    if (!conv) throw new NotFoundError('Conversation', conversationId)
    assertUnitAccess(ctx, conv.unitId)
    const settings = await loadAgentSettings(db, conv.unitId, providers.models)
    const memory = await loadMemory(db, conversationId, 16)
    const { brain } = await new SalesBrainService(db).resolve(conv.unitId)
    const catalog = await new ProductService(db).catalogForAgent(ctx, conv.unitId)
    const lastCustomer =
      [...memory.recent].reverse().find((m) => m.direction === 'inbound')?.text ?? ''
    const knowledge = lastCustomer
      ? await new KnowledgeSearchService(db, providers.embedding).search({
          tenantId: ctx.tenantId,
          unitId: conv.unitId,
          query: lastCustomer,
          limit: 4,
        })
      : []
    const prompt = await prompts.resolve(ctx.tenantId, 'copilot.suggest')
    const user = PromptRegistry.render(prompt.content, {
      mode,
      draft: draft ?? '(nenhum)',
      history: renderHistory(memory.recent, 3500),
      facts: renderFacts(memory.facts),
      catalog_summary: AgentTools.renderCatalog(catalog, {
        hidePricing: settings.salesMode === 'sdr',
      }),
      knowledge: KnowledgeSearchService.render(knowledge, 3000),
      sales_brain: SalesBrainService.render(brain),
      stage: memory.lead?.stageKey ?? 'new',
    })
    const run = await db.agentRun.create({
      data: {
        tenantId: ctx.tenantId,
        unitId: conv.unitId,
        conversationId,
        leadId: memory.lead?.id ?? null,
        kind: 'copilot',
        status: 'running',
      },
    })
    const res = await callJson(providers.llm, {
      model: settings.models.copilot,
      task: 'copilot',
      user,
      schema: CopilotSuggestionSchema,
      schemaName: 'copilot',
      maxTokens: 700,
      temperature: 0.4,
      metadata: { runId: run.id, mode },
    })
    const data = res.data ?? {
      suggestedReply: '',
      detectedObjection: null,
      nextBestAction: 'Revisar conversa',
      summary: 'Não foi possível gerar sugestão.',
      crmUpdates: [],
    }
    await db.agentRun.update({
      where: { id: run.id },
      data: {
        status: res.data ? 'completed' : 'failed',
        completedAt: new Date(),
        replyText: data.suggestedReply,
        model: res.response.model,
        inputTokens: res.response.usage.inputTokens,
        outputTokens: res.response.usage.outputTokens,
        costUsd: res.response.costUsd,
        latencyMs: res.response.latencyMs,
        sourceIds: knowledge.map((k) => k.chunkId),
        retrieval: {
          hits: knowledge.map((k) => ({ chunkId: k.chunkId, title: k.title })),
        } as Prisma.InputJsonValue,
        error: res.parseError ?? null,
      },
    })
    return { ...data, runId: run.id, costUsd: res.response.costUsd }
  }
}
