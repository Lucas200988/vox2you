import type { Prisma } from '@vox/db'
import { normalizePhone } from '@vox/shared'
import type { AgentDeps, AgentRunResult } from '../agent/types.js'
import { AgentOrchestrator } from '../agent/orchestrator.js'
import { ContactService } from '../crm/contact-service.js'
import { ConversationService } from '../crm/conversation-service.js'
import { LeadService } from '../crm/lead-service.js'
import { FollowUpService } from '../followup/service.js'
import { CampaignService } from '../campaigns/service.js'
import type { RealtimePublisher } from '../jobs/types.js'
import type { InboundEvent } from '../providers/messaging.js'
import { agentContext, runWithTenant } from '../tenant/context.js'

type ResolvedChannel = Prisma.ChannelGetPayload<{
  include: { unit: { select: { id: true; tenantId: true; timezone: true } } }
}>

export interface InboundResult {
  handled: boolean
  reason?: string
  tenantId?: string
  unitId?: string
  conversationId?: string
  contactId?: string
  leadId?: string
  messageId?: string
  duplicate?: boolean
  run?: AgentRunResult | null
}

/**
 * Turns a provider-agnostic InboundEvent into CRM state and (when applicable) an agent run.
 * Used by the worker (real webhooks) and by the API simulator.
 */
export class InboundProcessor {
  private readonly contacts: ContactService
  private readonly conversations: ConversationService
  private readonly orchestrator: AgentOrchestrator

  constructor(
    private readonly deps: AgentDeps,
    private readonly realtime?: RealtimePublisher,
  ) {
    this.contacts = new ContactService(deps.db)
    this.conversations = new ConversationService(deps.db)
    this.orchestrator = new AgentOrchestrator(deps)
  }

  async process(event: InboundEvent, opts: { runAgent?: boolean } = {}): Promise<InboundResult> {
    const { db, logger } = this.deps
    // Channel resolution decides the tenant, so it must never be ambiguous: a trusted caller may pin
    // the channel id; otherwise the (globally unique) provider external id is used and any duplicate
    // — which the DB constraint should make impossible — is refused instead of picking one tenant.
    const channelInclude = {
      unit: { select: { id: true, tenantId: true, timezone: true } },
    } as const
    const candidates = event.channelId
      ? await db.channel.findMany({
          where: { id: event.channelId, kind: 'whatsapp', status: 'active' },
          include: channelInclude,
        })
      : await db.channel.findMany({
          where: { kind: 'whatsapp', externalId: event.channelExternalId, status: 'active' },
          include: channelInclude,
          take: 2,
        })
    if (candidates.length > 1) {
      logger.error(
        { channelExternalId: event.channelExternalId },
        'inbound refused: external id maps to more than one channel',
      )
      return { handled: false, reason: 'ambiguous_channel' }
    }
    const channel = candidates[0]
    if (!channel) {
      logger.warn(
        { channelExternalId: event.channelExternalId, channelId: event.channelId },
        'inbound for unknown channel ignored',
      )
      return { handled: false, reason: 'unknown_channel' }
    }
    // From here on everything runs under the channel's tenant so CRM-managed credentials apply.
    await this.deps.warmTenant?.(channel.tenantId)
    return runWithTenant(channel.tenantId, () => this.handle(event, channel, opts))
  }

  private async handle(
    event: InboundEvent,
    channel: ResolvedChannel,
    opts: { runAgent?: boolean },
  ): Promise<InboundResult> {
    const { db, logger } = this.deps
    const tenantId = channel.tenantId
    const unitId = channel.unitId
    const ctx = agentContext(tenantId)

    if (event.kind === 'status') {
      const msg = await this.conversations.updateMessageStatus(
        ctx,
        event.providerMessageId,
        event.status,
        event.timestamp,
        { code: event.errorCode, title: event.errorTitle },
      )
      if (msg)
        await this.realtime?.publish({
          type: 'message.status',
          tenantId,
          unitId,
          conversationId: msg.conversationId,
          payload: { messageId: msg.id, status: event.status },
          at: new Date().toISOString(),
        })
      return {
        handled: !!msg,
        reason: msg ? undefined : 'unknown_message',
        tenantId,
        unitId,
        conversationId: msg?.conversationId,
      }
    }

    // 1. Contact, conversation, lead, message — one transaction
    const saved = await db.$transaction(async (tx) => {
      const { contact, created: contactCreated } = await this.contacts.findOrCreateByIdentity(
        tx,
        ctx,
        {
          channel: 'whatsapp',
          externalId: event.from,
          displayName: event.fromName,
          source: event.referral ? 'click_to_whatsapp' : 'whatsapp_organic',
        },
      )
      const { conversation } = await this.conversations.getOrOpen(tx, ctx, {
        unitId,
        channelId: channel.id,
        contactId: contact.id,
      })
      const { lead } = await new LeadService(db).getOrCreateOpen(tx, ctx, {
        unitId,
        contactId: contact.id,
        source: contact.source ?? undefined,
      })
      if (conversation.leadId !== lead.id)
        await tx.conversation.update({ where: { id: conversation.id }, data: { leadId: lead.id } })
      if (event.referral && contactCreated) {
        await tx.attribution.create({
          data: {
            tenantId,
            contactId: contact.id,
            leadId: lead.id,
            referralType: 'click_to_whatsapp',
            sourceUrl: event.referral.sourceUrl ?? null,
            headline: event.referral.headline ?? null,
            ctwaClid: event.referral.ctwaClid ?? null,
            adId: event.referral.adId ?? null,
            raw: event.referral as Prisma.InputJsonValue,
          },
        })
      }
      const replyTo = event.replyToProviderMessageId
        ? await tx.message.findUnique({
            where: {
              tenantId_providerMessageId: {
                tenantId,
                providerMessageId: event.replyToProviderMessageId,
              },
            },
            select: { id: true },
          })
        : null
      const { message, duplicate } = await this.conversations.appendMessage(
        tx,
        ctx,
        conversation.id,
        {
          direction: 'inbound',
          type: event.type,
          authorType: 'contact',
          text:
            event.text ??
            (event.location
              ? `[localização] ${event.location.name ?? ''} ${event.location.address ?? ''}`.trim()
              : null),
          providerMessageId: event.providerMessageId,
          replyToMessageId: replyTo?.id ?? null,
          payload: {
            referral: event.referral,
            interactive: event.interactive,
            location: event.location,
          } as Prisma.InputJsonValue,
          createdAt: event.timestamp,
          attachments: event.media
            ? [
                {
                  kind: event.type === 'sticker' ? 'sticker' : (event.type as string),
                  providerMediaId: event.media.providerMediaId,
                  mimeType: event.media.mimeType,
                  fileName: event.media.fileName,
                  caption: event.media.caption,
                  sha256: event.media.sha256,
                },
              ]
            : undefined,
        },
      )
      if (!duplicate) await FollowUpService.cancelPendingTx(tx, lead.id, 'customer_replied')
      if (!duplicate) await CampaignService.markRepliedTx(tx, contact.id)
      await tx.contact.update({
        where: { id: contact.id },
        data: {
          lastSeenAt: new Date(),
          ...(contact.phone ? {} : { phone: normalizePhone(event.from) }),
        },
      })
      return { contact, conversation, lead, message, duplicate }
    })

    if (saved.duplicate)
      return {
        handled: true,
        duplicate: true,
        tenantId,
        unitId,
        conversationId: saved.conversation.id,
        contactId: saved.contact.id,
        leadId: saved.lead.id,
        messageId: saved.message.id,
      }

    await this.realtime?.publish({
      type: 'message.new',
      tenantId,
      unitId,
      conversationId: saved.conversation.id,
      leadId: saved.lead.id,
      payload: { messageId: saved.message.id, direction: 'inbound', preview: saved.message.text },
      at: new Date().toISOString(),
    })

    // 2. Media → storage + transcription
    let text = event.text ?? ''
    if (event.media && (event.type === 'audio' || event.type === 'video')) {
      text = (await this.transcribe(tenantId, saved.message.id, event)) ?? text
    } else if (event.media && event.media.caption) {
      text = event.media.caption
    } else if (event.media) {
      await this.storeMedia(tenantId, saved.message.id, event).catch((err) =>
        logger.warn({ err }, 'media storage failed'),
      )
    }

    if (event.type === 'reaction')
      return {
        handled: true,
        tenantId,
        unitId,
        conversationId: saved.conversation.id,
        contactId: saved.contact.id,
        leadId: saved.lead.id,
        messageId: saved.message.id,
        run: null,
      }
    if (!text.trim())
      text =
        event.type === 'image'
          ? '[cliente enviou uma imagem]'
          : event.type === 'document'
            ? `[cliente enviou um documento${event.media?.fileName ? `: ${event.media.fileName}` : ''}]`
            : event.type === 'location'
              ? '[cliente enviou uma localização]'
              : '[mensagem sem texto]'

    // 3. Agent
    let run: AgentRunResult | null = null
    if (opts.runAgent !== false) {
      run = await this.orchestrator.run({
        tenantId,
        unitId,
        conversationId: saved.conversation.id,
        inboundMessageId: saved.message.id,
        text,
        kind: 'reply',
      })
      await this.realtime?.publish({
        type: 'agent.run',
        tenantId,
        unitId,
        conversationId: saved.conversation.id,
        leadId: saved.lead.id,
        payload: {
          runId: run.runId,
          decision: run.decision,
          reply: run.reply,
          outboundMessageId: run.outboundMessageId,
          score: run.score,
          stage: run.stage,
        },
        at: new Date().toISOString(),
      })
      if (run.decision === 'handoff')
        await this.realtime?.publish({
          type: 'handoff',
          tenantId,
          unitId,
          conversationId: saved.conversation.id,
          leadId: saved.lead.id,
          payload: { reason: run.handoffReason },
          at: new Date().toISOString(),
        })
    }
    return {
      handled: true,
      tenantId,
      unitId,
      conversationId: saved.conversation.id,
      contactId: saved.contact.id,
      leadId: saved.lead.id,
      messageId: saved.message.id,
      run,
    }
  }

  private async storeMedia(
    tenantId: string,
    messageId: string,
    event: Extract<InboundEvent, { kind: 'message' }>,
  ) {
    const { providers, db } = this.deps
    if (!event.media) return null
    const media = await providers.messaging.downloadMedia(event.media.providerMediaId)
    const ext = (media.mimeType.split('/')[1] ?? 'bin').split(';')[0]
    const key = `media/${tenantId}/${messageId}.${ext}`
    await providers.storage.put(key, media.buffer, media.mimeType)
    await db.attachment.updateMany({
      where: { messageId },
      data: { storageKey: key, mimeType: media.mimeType, sizeBytes: media.buffer.length },
    })
    return { key, media }
  }

  private async transcribe(
    tenantId: string,
    messageId: string,
    event: Extract<InboundEvent, { kind: 'message' }>,
  ): Promise<string | null> {
    const { providers, db, logger } = this.deps
    try {
      const stored = await this.storeMedia(tenantId, messageId, event)
      if (!stored) return null
      const result = await providers.stt.transcribe({
        buffer: stored.media.buffer,
        mimeType: stored.media.mimeType,
        languageHint: 'pt-BR',
      })
      await db.message.update({
        where: { id: messageId },
        data: { transcript: result.text, transcriptLanguage: result.language ?? null },
      })
      await db.attachment.updateMany({
        where: { messageId },
        data: { durationSec: result.durationSec ?? null },
      })
      return result.text
    } catch (err) {
      logger.error({ err, messageId }, 'transcription failed')
      return null
    }
  }
}
