import type { Db, DbTx, Prisma } from '@vox/db'
import { truncate } from '@vox/shared'
import { emitEvent } from '../events/outbox.js'
import { NotFoundError } from '../errors.js'
import { assertUnitAccess, unitScope, type TenantContext } from '../tenant/context.js'

export interface AppendMessageInput {
  direction: 'inbound' | 'outbound'
  type: string
  authorType: 'contact' | 'agent' | 'user' | 'system'
  authorUserId?: string
  text?: string | null
  transcript?: string | null
  transcriptLanguage?: string | null
  status?: string
  providerMessageId?: string | null
  replyToMessageId?: string | null
  templateName?: string | null
  agentRunId?: string | null
  payload?: unknown
  createdAt?: Date
  attachments?: Array<{ kind: string; providerMediaId?: string; mimeType?: string; fileName?: string; caption?: string; sha256?: string }>
}

export class ConversationService {
  constructor(private readonly db: Db) {}

  /** Returns the open conversation for contact+channel, or opens a new one. */
  async getOrOpen(tx: DbTx, ctx: TenantContext, params: { unitId: string; channelId: string; contactId: string }) {
    const existing = await tx.conversation.findFirst({
      where: { tenantId: ctx.tenantId, channelId: params.channelId, contactId: params.contactId, status: 'open' },
    })
    if (existing) return { conversation: existing, created: false }
    const conversation = await tx.conversation.create({
      data: { tenantId: ctx.tenantId, unitId: params.unitId, channelId: params.channelId, contactId: params.contactId, status: 'open', mode: 'ai' },
    })
    await emitEvent(tx, {
      type: 'conversation.opened',
      tenantId: ctx.tenantId,
      unitId: params.unitId,
      aggregateType: 'conversation',
      aggregateId: conversation.id,
      payload: { contactId: params.contactId, channelId: params.channelId },
      actor: ctx.actor,
    })
    return { conversation, created: true }
  }

  async appendMessage(tx: DbTx, ctx: TenantContext, conversationId: string, input: AppendMessageInput) {
    const conversation = await tx.conversation.findFirst({ where: { id: conversationId, tenantId: ctx.tenantId } })
    if (!conversation) throw new NotFoundError('Conversation', conversationId)

    if (input.providerMessageId) {
      const dup = await tx.message.findUnique({
        where: { tenantId_providerMessageId: { tenantId: ctx.tenantId, providerMessageId: input.providerMessageId } },
      })
      if (dup) return { message: dup, duplicate: true }
    }

    const createdAt = input.createdAt ?? new Date()
    const message = await tx.message.create({
      data: {
        tenantId: ctx.tenantId,
        conversationId,
        direction: input.direction,
        type: input.type,
        authorType: input.authorType,
        authorUserId: input.authorUserId ?? null,
        text: input.text ?? null,
        transcript: input.transcript ?? null,
        transcriptLanguage: input.transcriptLanguage ?? null,
        status: input.status ?? (input.direction === 'inbound' ? 'received' : 'queued'),
        providerMessageId: input.providerMessageId ?? null,
        replyToMessageId: input.replyToMessageId ?? null,
        templateName: input.templateName ?? null,
        agentRunId: input.agentRunId ?? null,
        payload: (input.payload ?? {}) as Prisma.InputJsonValue,
        createdAt,
        attachments: input.attachments?.length
          ? { create: input.attachments.map((a) => ({ tenantId: ctx.tenantId, kind: a.kind, providerMediaId: a.providerMediaId ?? null, mimeType: a.mimeType ?? null, fileName: a.fileName ?? null, caption: a.caption ?? null, sha256: a.sha256 ?? null })) }
          : undefined,
      },
    })

    const preview = truncate(input.text ?? input.transcript ?? `[${input.type}]`, 120)
    await tx.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: createdAt,
        lastMessagePreview: preview,
        ...(input.direction === 'inbound'
          ? { lastInboundAt: createdAt, unreadCount: { increment: 1 } }
          : { lastOutboundAt: createdAt }),
      },
    })

    await emitEvent(tx, {
      type: input.direction === 'inbound' ? 'message.received' : 'message.sent',
      tenantId: ctx.tenantId,
      unitId: conversation.unitId,
      aggregateType: 'conversation',
      aggregateId: conversationId,
      payload: { messageId: message.id, type: input.type, authorType: input.authorType, contactId: conversation.contactId, leadId: conversation.leadId },
      actor: ctx.actor,
    })
    return { message, duplicate: false }
  }

  async updateMessageStatus(ctx: TenantContext, providerMessageId: string, status: string, at: Date, error?: { code?: string; title?: string }) {
    const message = await this.db.message.findUnique({ where: { tenantId_providerMessageId: { tenantId: ctx.tenantId, providerMessageId } } })
    if (!message) return null
    const order = ['queued', 'sent', 'delivered', 'read', 'failed']
    if (order.indexOf(status) < order.indexOf(message.status) && status !== 'failed') return message
    return this.db.$transaction(async (tx) => {
      const updated = await tx.message.update({
        where: { id: message.id },
        data: {
          status,
          ...(status === 'sent' ? { sentAt: at } : {}),
          ...(status === 'delivered' ? { deliveredAt: at } : {}),
          ...(status === 'read' ? { readAt: at } : {}),
          ...(status === 'failed' ? { errorCode: error?.code ?? null, errorTitle: error?.title ?? null } : {}),
        },
      })
      await emitEvent(tx, {
        type: 'message.status_changed',
        tenantId: ctx.tenantId,
        aggregateType: 'message',
        aggregateId: message.id,
        payload: { status, conversationId: message.conversationId },
        actor: 'system',
      })
      return updated
    })
  }

  async list(ctx: TenantContext, filters: { unitId?: string; mode?: string; status?: string; assigneeId?: string; q?: string; limit?: number; cursor?: string }) {
    const where: Prisma.ConversationWhereInput = {
      tenantId: ctx.tenantId,
      ...unitScope(ctx),
      ...(filters.unitId ? { unitId: filters.unitId } : {}),
      ...(filters.mode ? { mode: filters.mode } : {}),
      status: filters.status ?? 'open',
      ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
      ...(filters.q ? { contact: { OR: [{ name: { contains: filters.q, mode: 'insensitive' } }, { phone: { contains: filters.q.replace(/\D/g, '') } }] } } : {}),
    }
    return this.db.conversation.findMany({
      where,
      include: {
        contact: { select: { id: true, name: true, phone: true, profileType: true, source: true } },
        lead: { select: { id: true, score: true, stage: { select: { key: true, name: true, color: true } }, interestProduct: { select: { name: true } }, owner: { select: { id: true, name: true } } } },
        assignee: { select: { id: true, name: true } },
        channel: { select: { kind: true, name: true } },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: filters.limit ?? 50,
      ...(filters.cursor ? { skip: 1, cursor: { id: filters.cursor } } : {}),
    })
  }

  async get(ctx: TenantContext, id: string) {
    const conversation = await this.db.conversation.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        contact: { include: { consents: true, company: true } },
        lead: { include: { stage: true, facts: { where: { status: 'active' } }, interestProduct: true, recommendedProduct: true, owner: { select: { id: true, name: true } }, tags: { include: { tag: true } } } },
        assignee: { select: { id: true, name: true } },
        channel: true,
        unit: { select: { id: true, name: true, timezone: true } },
      },
    })
    if (!conversation) throw new NotFoundError('Conversation', id)
    assertUnitAccess(ctx, conversation.unitId)
    return conversation
  }

  async messages(ctx: TenantContext, conversationId: string, limit = 100, before?: Date) {
    await this.get(ctx, conversationId)
    return this.db.message.findMany({
      where: { conversationId, ...(before ? { createdAt: { lt: before } } : {}) },
      include: { attachments: true, authorUser: { select: { id: true, name: true } }, agentRun: { select: { id: true, confidence: true, decision: true, sourceIds: true, costUsd: true, latencyMs: true, model: true } } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    })
  }

  async markRead(ctx: TenantContext, conversationId: string) {
    await this.db.conversation.updateMany({ where: { id: conversationId, tenantId: ctx.tenantId }, data: { unreadCount: 0 } })
  }

  /** Human handoff / resume. */
  async setMode(ctx: TenantContext, conversationId: string, mode: 'ai' | 'human' | 'paused', opts: { assigneeId?: string; reason?: string; handoffSummary?: unknown } = {}) {
    const conversation = await this.get(ctx, conversationId)
    return this.db.$transaction(async (tx) => {
      const updated = await tx.conversation.update({
        where: { id: conversationId },
        data: {
          mode,
          assigneeId: opts.assigneeId ?? (mode === 'ai' ? null : conversation.assigneeId),
          ...(mode === 'human'
            ? { handoffReason: opts.reason ?? null, handoffAt: new Date(), handoffSummary: (opts.handoffSummary ?? conversation.handoffSummary ?? undefined) as Prisma.InputJsonValue | undefined }
            : {}),
        },
      })
      await emitEvent(tx, {
        type: mode === 'ai' ? 'handoff.resumed' : 'handoff.requested',
        tenantId: ctx.tenantId,
        unitId: conversation.unitId,
        aggregateType: 'conversation',
        aggregateId: conversationId,
        payload: { mode, assigneeId: updated.assigneeId, reason: opts.reason, leadId: conversation.leadId, contactId: conversation.contactId },
        actor: ctx.actor,
      })
      await emitEvent(tx, {
        type: 'conversation.mode_changed',
        tenantId: ctx.tenantId,
        unitId: conversation.unitId,
        aggregateType: 'conversation',
        aggregateId: conversationId,
        payload: { from: conversation.mode, to: mode },
        actor: ctx.actor,
      })
      if (mode === 'human' && updated.assigneeId && conversation.leadId) {
        await tx.lead.update({ where: { id: conversation.leadId }, data: { ownerId: updated.assigneeId } })
      }
      return updated
    })
  }

  async close(ctx: TenantContext, conversationId: string) {
    const conversation = await this.get(ctx, conversationId)
    return this.db.$transaction(async (tx) => {
      const updated = await tx.conversation.update({ where: { id: conversationId }, data: { status: 'closed', closedAt: new Date() } })
      await emitEvent(tx, { type: 'conversation.closed', tenantId: ctx.tenantId, unitId: conversation.unitId, aggregateType: 'conversation', aggregateId: conversationId, payload: {}, actor: ctx.actor })
      return updated
    })
  }
}
