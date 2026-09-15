import type { Db } from '@vox/db'
import { ConversationService } from '../crm/conversation-service.js'
import { NotFoundError, PolicyError } from '../errors.js'
import type { Providers } from '../providers/index.js'
import type { TenantContext } from '../tenant/context.js'
import { isSessionWindowOpen } from '../window/policy.js'
import { PromptRegistry } from '../prompts/registry.js'
import type { RealtimePublisher } from '../jobs/types.js'

export interface HumanSendInput {
  text?: string
  templateName?: string
  templateLanguage?: string
  templateVariables?: string[]
}

/**
 * Outbound messages authored by humans/automations. Enforces the WhatsApp session window:
 * free text only inside 24h; otherwise an approved template is required.
 */
export class OutboundService {
  private readonly conversations: ConversationService
  constructor(
    private readonly db: Db,
    private readonly providers: Providers,
    private readonly realtime?: RealtimePublisher,
  ) {
    this.conversations = new ConversationService(db)
  }

  async send(ctx: TenantContext, conversationId: string, input: HumanSendInput, authorType: 'user' | 'system' | 'agent' = 'user') {
    const conversation = await this.conversations.get(ctx, conversationId)
    const windowOpen = isSessionWindowOpen(conversation.channel.kind, conversation.lastInboundAt)
    const isTemplate = !!input.templateName
    if (!windowOpen && !isTemplate) throw new PolicyError('Janela de 24h fechada: envie um template aprovado', 'session_window_closed')
    if (!isTemplate && !input.text?.trim()) throw new PolicyError('Texto vazio', 'empty_message')

    let templateBody: string | null = null
    if (isTemplate) {
      const tpl = await this.db.messageTemplate.findFirst({ where: { tenantId: ctx.tenantId, name: input.templateName!, ...(input.templateLanguage ? { language: input.templateLanguage } : {}) } })
      if (!tpl) throw new NotFoundError('MessageTemplate', input.templateName)
      if (tpl.status !== 'approved') throw new PolicyError(`Template "${tpl.name}" não está aprovado (${tpl.status})`, 'template_not_approved')
      templateBody = tpl.body ? PromptRegistry.render(tpl.body.replace(/\{\{(\d+)\}\}/g, (_, n: string) => `{{v${n}}}`), Object.fromEntries((input.templateVariables ?? []).map((v, i) => [`v${i + 1}`, v]))) : `[template ${tpl.name}]`
      input.templateLanguage = tpl.language
    }

    const { message } = await this.db.$transaction((tx) => this.conversations.appendMessage(tx, ctx, conversationId, { direction: 'outbound', type: isTemplate ? 'template' : 'text', authorType, authorUserId: authorType === 'user' ? ctx.userId : undefined, text: isTemplate ? templateBody : input.text!.trim(), templateName: input.templateName ?? null, status: 'queued' }))
    await this.realtime?.publish({ type: 'message.new', tenantId: ctx.tenantId, unitId: conversation.unitId, conversationId, leadId: conversation.leadId ?? undefined, payload: { messageId: message.id, direction: 'outbound', preview: message.text }, at: new Date().toISOString() })

    const identity = await this.db.contactIdentity.findFirst({ where: { contactId: conversation.contactId, channel: conversation.channel.kind } })
    const to = identity?.externalId ?? (conversation.contact.phone ?? '').replace(/^\+/, '')
    const messaging = this.providers.messagingFor ? this.providers.messagingFor({ provider: conversation.channel.provider, externalId: conversation.channel.externalId, config: conversation.channel.config }) : this.providers.messaging
    try {
      const sent = isTemplate
        ? await messaging.sendTemplate({ to, templateName: input.templateName!, language: input.templateLanguage ?? 'pt_BR', bodyVariables: input.templateVariables })
        : await messaging.sendText({ to, text: input.text!.trim() })
      const updated = await this.db.message.update({ where: { id: message.id }, data: { status: 'sent', sentAt: new Date(), providerMessageId: sent.providerMessageId } })
      await this.realtime?.publish({ type: 'message.status', tenantId: ctx.tenantId, unitId: conversation.unitId, conversationId, payload: { messageId: message.id, status: 'sent' }, at: new Date().toISOString() })
      return updated
    } catch (err) {
      const failed = await this.db.message.update({ where: { id: message.id }, data: { status: 'failed', errorTitle: (err as Error).message } })
      await this.realtime?.publish({ type: 'message.status', tenantId: ctx.tenantId, unitId: conversation.unitId, conversationId, payload: { messageId: message.id, status: 'failed' }, at: new Date().toISOString() })
      throw Object.assign(err as Error, { messageId: failed.id })
    }
  }
}
