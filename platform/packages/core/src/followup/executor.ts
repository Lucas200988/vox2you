import { z } from 'zod'
import { FollowUpService } from './service.js'
import type { AgentDeps } from '../agent/types.js'
import { callJson } from '../agent/llm-json.js'
import { loadMemory, renderFacts, renderHistory } from '../agent/memory.js'
import { AgentTools } from '../agent/tools/index.js'
import { ProductService } from '../catalog/product-service.js'
import { ConsentService } from '../crm/consent-service.js'
import { OutboundService } from '../outbound/service.js'
import { PromptRegistry } from '../prompts/registry.js'
import { loadAgentSettings } from '../settings/agent-settings.js'
import { agentContext } from '../tenant/context.js'
import { isSessionWindowOpen } from '../window/policy.js'
import { runGuardrails } from '../agent/guardrails.js'
import type { RealtimePublisher } from '../jobs/types.js'

const FollowUpReply = z.object({ reply: z.string().min(5).max(600) })

/**
 * Executes a due follow-up: re-checks consent/mode/window, composes a contextual message
 * (LLM, guardrailed) or falls back to an approved template when the session window is closed.
 */
export class FollowUpExecutor {
  constructor(
    private readonly deps: AgentDeps,
    private readonly realtime?: RealtimePublisher,
  ) {}

  async execute(followUpId: string): Promise<{ status: 'sent' | 'skipped'; reason?: string; messageId?: string }> {
    const { db, providers, prompts, logger } = this.deps
    const service = new FollowUpService(db)
    const fu = await db.followUp.findUnique({ where: { id: followUpId }, include: { lead: { include: { contact: true, unit: true, stage: true } }, conversation: { include: { channel: true } } } })
    if (!fu || fu.status !== 'scheduled') return { status: 'skipped', reason: 'not_scheduled' }
    const ctx = agentContext(fu.tenantId)
    const skip = async (reason: string) => {
      await service.skip(followUpId, reason)
      return { status: 'skipped' as const, reason }
    }
    if (await ConsentService.isOptedOut(db, fu.lead.contactId)) return skip('opt_out')
    if (fu.lead.status !== 'open') return skip(`lead_${fu.lead.status}`)
    if (fu.lead.doNotContactUntil && fu.lead.doNotContactUntil > new Date()) return skip('do_not_contact_until')
    const conversation = fu.conversation ?? (await db.conversation.findFirst({ where: { leadId: fu.leadId, status: 'open' }, include: { channel: true } }))
    if (!conversation) return skip('no_conversation')
    if (conversation.mode !== 'ai') return skip(`conversation_mode_${conversation.mode}`)
    // Customer wrote after scheduling → the agent already handled it
    if (conversation.lastInboundAt && conversation.lastInboundAt > fu.createdAt) return skip('customer_replied')

    const settings = await loadAgentSettings(db, fu.lead.unitId, providers.models)
    const outbound = new OutboundService(db, providers, this.realtime)
    const windowOpen = isSessionWindowOpen(conversation.channel.kind, conversation.lastInboundAt)

    if (!windowOpen) {
      const template = await db.messageTemplate.findFirst({ where: { tenantId: fu.tenantId, status: 'approved', category: 'MARKETING', channelKind: 'whatsapp' }, orderBy: { updatedAt: 'desc' } })
      if (!template) {
        await db.task.create({ data: { tenantId: fu.tenantId, leadId: fu.leadId, title: 'Follow-up fora da janela de 24h sem template aprovado: contatar manualmente', kind: 'message', priority: 'normal', createdBy: 'agent', assigneeId: fu.lead.ownerId } })
        return skip('window_closed_no_template')
      }
      const product = fu.lead.interestProductId ? await db.product.findUnique({ where: { id: fu.lead.interestProductId } }) : null
      const vars = [fu.lead.contact.firstName ?? 'tudo bem', product?.name ?? 'seu desenvolvimento em comunicação']
      const msg = await outbound.send(ctx, conversation.id, { templateName: template.name, templateLanguage: template.language, templateVariables: vars.slice(0, template.variables.length || 2) }, 'agent')
      await service.markSent(followUpId, msg.id)
      return { status: 'sent', messageId: msg.id }
    }

    const memory = await loadMemory(db, conversation.id, 10)
    const catalog = await new ProductService(db).catalogForAgent(ctx, fu.lead.unitId)
    const prompt = await prompts.resolve(fu.tenantId, 'followup.compose')
    const user = PromptRegistry.render(prompt.content, { scenario: fu.scenario ?? 'generic', goal: fu.goal ?? 'retomar a conversa', facts: renderFacts(memory.facts), summary: memory.conversation.summary ?? '(sem resumo)', catalog_summary: AgentTools.renderCatalog(catalog, { hidePricing: settings.salesMode === 'sdr' }), last_messages: renderHistory(memory.recent.slice(-6), 1500), agent_name: settings.agentName })
    const res = await callJson(providers.llm, { model: settings.models.generate, task: 'followup', user, schema: FollowUpReply, schemaName: 'followup', maxTokens: 300, temperature: 0.6 })
    if (!res.data) return skip('compose_failed')
    const guard = runGuardrails({ reply: res.data.reply, catalog, knowledge: [], slots: null, memory, maxChars: 400, maxQuestions: 1, timezone: fu.lead.unit.timezone })
    if (!guard.ok) {
      logger.warn({ followUpId, issues: guard.issues }, 'follow-up blocked by guardrails')
      await db.task.create({ data: { tenantId: fu.tenantId, leadId: fu.leadId, title: `Follow-up bloqueado pela validação (${guard.issues.map((i) => i.code).join(',')}): enviar manualmente`, kind: 'message', priority: 'normal', createdBy: 'agent', assigneeId: fu.lead.ownerId } })
      return skip('blocked_by_guardrails')
    }
    const msg = await outbound.send(ctx, conversation.id, { text: guard.rewrittenReply ?? res.data.reply }, 'agent')
    await db.followUp.update({ where: { id: followUpId }, data: { draftMessage: guard.rewrittenReply ?? res.data.reply } })
    await service.markSent(followUpId, msg.id)
    await db.agentRun.create({ data: { tenantId: fu.tenantId, unitId: fu.lead.unitId, conversationId: conversation.id, leadId: fu.leadId, kind: 'followup', status: 'completed', completedAt: new Date(), replyText: msg.text, model: res.response.model, inputTokens: res.response.usage.inputTokens, outputTokens: res.response.usage.outputTokens, costUsd: res.response.costUsd, latencyMs: res.response.latencyMs, decision: 'reply', decisionReason: `followup:${fu.scenario ?? 'generic'}` } })
    return { status: 'sent', messageId: msg.id }
  }
}
