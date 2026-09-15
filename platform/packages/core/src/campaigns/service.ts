import type { Db, DbTx, Prisma } from '@vox/db'
import { formatInZone } from '@vox/shared'
import { ConsentService } from '../crm/consent-service.js'
import { ConversationService } from '../crm/conversation-service.js'
import { NotFoundError, ValidationError } from '../errors.js'
import { emitEvent } from '../events/outbox.js'
import type { RealtimePublisher } from '../jobs/types.js'
import type { Logger } from '../logger.js'
import { OutboundService } from '../outbound/service.js'
import type { Providers } from '../providers/index.js'
import {
  assertUnitAccess,
  systemContext,
  unitScope,
  type TenantContext,
} from '../tenant/context.js'

/** Who receives the campaign. Every filter is optional; opted-out contacts are always excluded. */
export interface CampaignSegment {
  stageKeys?: string[]
  statuses?: string[] // lead status: open | nurture | lost | won (default: open + nurture)
  minScore?: number
  maxScore?: number
  sources?: string[]
  tagIds?: string[]
  ownerIds?: string[]
  /** Only leads with no interaction for at least N days (re-engagement) */
  inactiveForDays?: number
  createdAfter?: string
  createdBefore?: string
  /** Local time window in the unit's timezone, e.g. 08:00–20:00; outside it sending pauses */
  sendWindow?: { start: string; end: string }
}

export interface CampaignInput {
  name: string
  unitId: string
  templateId: string | null
  segment: CampaignSegment
  /** One entry per template variable: a token ({{firstName}}, {{productName}}, {{unitName}}, {{ownerName}}) or literal text */
  variables: string[]
  rateLimitPerMin?: number
  scheduledAt?: string | null
}

export const CAMPAIGN_TOKENS = [
  '{{firstName}}',
  '{{name}}',
  '{{productName}}',
  '{{unitName}}',
  '{{ownerName}}',
  '{{city}}',
] as const

const REPLY_WINDOW_HOURS = 72

/**
 * Batch WhatsApp campaigns: a segment of leads receives an approved template, throttled per minute
 * and restricted to a local send window. Recipients are materialised when the campaign is scheduled,
 * each send goes through the normal outbound path (conversation + message + queue), replies within
 * 72h are attributed back to the campaign.
 */
export class CampaignService {
  constructor(
    private readonly db: Db,
    private readonly deps: {
      providers?: Providers
      realtime?: RealtimePublisher
      logger?: Logger
    } = {},
  ) {}

  segmentWhere(
    ctx: TenantContext,
    unitId: string,
    segment: CampaignSegment,
  ): Prisma.LeadWhereInput {
    const now = Date.now()
    return {
      tenantId: ctx.tenantId,
      unitId,
      status: { in: segment.statuses?.length ? segment.statuses : ['open', 'nurture'] },
      ...(segment.stageKeys?.length ? { stage: { key: { in: segment.stageKeys } } } : {}),
      ...(segment.minScore !== undefined ? { score: { gte: segment.minScore } } : {}),
      ...(segment.maxScore !== undefined ? { score: { lte: segment.maxScore } } : {}),
      ...(segment.ownerIds?.length ? { ownerId: { in: segment.ownerIds } } : {}),
      ...(segment.tagIds?.length ? { tags: { some: { tagId: { in: segment.tagIds } } } } : {}),
      ...(segment.inactiveForDays
        ? {
            OR: [
              { lastInteractionAt: null },
              { lastInteractionAt: { lte: new Date(now - segment.inactiveForDays * 864e5) } },
            ],
          }
        : {}),
      ...(segment.createdAfter ? { createdAt: { gte: new Date(segment.createdAfter) } } : {}),
      ...(segment.createdBefore ? { createdAt: { lte: new Date(segment.createdBefore) } } : {}),
      contact: {
        phone: { not: null },
        ...(segment.sources?.length ? { source: { in: segment.sources } } : {}),
        consents: { none: { purpose: 'marketing', status: 'opted_out' } },
      },
    }
  }

  async preview(ctx: TenantContext, unitId: string, segment: CampaignSegment) {
    assertUnitAccess(ctx, unitId)
    const where = this.segmentWhere(ctx, unitId, segment)
    const [total, sample] = await Promise.all([
      this.db.lead.count({ where }),
      this.db.lead.findMany({
        where,
        take: 8,
        orderBy: { lastInteractionAt: 'desc' },
        select: {
          id: true,
          score: true,
          stage: { select: { name: true } },
          contact: { select: { name: true, phone: true } },
        },
      }),
    ])
    return { total, sample }
  }

  list(ctx: TenantContext, unitId?: string) {
    return this.db.campaign.findMany({
      where: { tenantId: ctx.tenantId, ...unitScope(ctx), ...(unitId ? { unitId } : {}) },
      include: { template: { select: { id: true, name: true, status: true, variables: true } } },
      orderBy: { createdAt: 'desc' },
    })
  }

  async get(ctx: TenantContext, id: string) {
    const c = await this.db.campaign.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        template: { select: { id: true, name: true, status: true, variables: true, body: true } },
      },
    })
    if (!c) throw new NotFoundError('Campaign', id)
    return { ...c, stats: await this.stats(id) }
  }

  async create(ctx: TenantContext, input: CampaignInput) {
    assertUnitAccess(ctx, input.unitId)
    await this.assertTemplate(ctx, input.templateId, input.variables)
    return this.db.campaign.create({
      data: {
        tenantId: ctx.tenantId,
        unitId: input.unitId,
        name: input.name,
        templateId: input.templateId,
        segment: input.segment as Prisma.InputJsonValue,
        variables: input.variables as Prisma.InputJsonValue,
        rateLimitPerMin: input.rateLimitPerMin ?? 30,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        createdBy: ctx.userId ?? null,
      },
    })
  }

  async update(ctx: TenantContext, id: string, input: Partial<CampaignInput>) {
    const current = await this.get(ctx, id)
    if (!['draft', 'scheduled', 'paused'].includes(current.status))
      throw new ValidationError(`Campanha ${current.status} não pode ser editada`)
    if (input.unitId) assertUnitAccess(ctx, input.unitId)
    if (input.templateId !== undefined || input.variables)
      await this.assertTemplate(
        ctx,
        input.templateId ?? current.templateId,
        input.variables ?? (current.variables as string[]),
      )
    return this.db.campaign.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.unitId !== undefined ? { unitId: input.unitId } : {}),
        ...(input.templateId !== undefined ? { templateId: input.templateId } : {}),
        ...(input.segment !== undefined ? { segment: input.segment as Prisma.InputJsonValue } : {}),
        ...(input.variables !== undefined
          ? { variables: input.variables as Prisma.InputJsonValue }
          : {}),
        ...(input.rateLimitPerMin !== undefined ? { rateLimitPerMin: input.rateLimitPerMin } : {}),
        ...(input.scheduledAt !== undefined
          ? { scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null }
          : {}),
      },
    })
  }

  /** Materialises the recipients from the segment and arms the campaign (now or at `at`). */
  async schedule(ctx: TenantContext, id: string, at?: Date) {
    const c = await this.get(ctx, id)
    if (!['draft', 'scheduled', 'paused'].includes(c.status))
      throw new ValidationError(`Campanha ${c.status} não pode ser agendada`)
    if (!c.templateId) throw new ValidationError('Escolha um template aprovado antes de agendar')
    await this.assertTemplate(ctx, c.templateId, c.variables as string[])
    const leads = await this.db.lead.findMany({
      where: this.segmentWhere(ctx, c.unitId, c.segment as CampaignSegment),
      select: { id: true, contactId: true },
      orderBy: { score: 'desc' },
    })
    const seen = new Set<string>()
    const rows = leads.filter((l) =>
      seen.has(l.contactId) ? false : (seen.add(l.contactId), true),
    )
    await this.db.$transaction(async (tx) => {
      await tx.campaignRecipient.deleteMany({ where: { campaignId: id, status: 'pending' } })
      if (rows.length)
        await tx.campaignRecipient.createMany({
          data: rows.map((l) => ({ campaignId: id, contactId: l.contactId, leadId: l.id })),
          skipDuplicates: true,
        })
      await tx.campaign.update({
        where: { id },
        data: {
          status: 'scheduled',
          scheduledAt: at ?? new Date(),
          stats: { recipients: rows.length },
        },
      })
      await emitEvent(tx, {
        type: 'campaign.scheduled',
        tenantId: ctx.tenantId,
        unitId: c.unitId,
        aggregateType: 'campaign',
        aggregateId: id,
        payload: { recipients: rows.length, scheduledAt: (at ?? new Date()).toISOString() },
        actor: ctx.actor,
      })
    })
    return this.get(ctx, id)
  }

  async pause(ctx: TenantContext, id: string) {
    const c = await this.get(ctx, id)
    if (!['scheduled', 'running'].includes(c.status))
      throw new ValidationError(`Campanha ${c.status} não pode ser pausada`)
    await this.db.campaign.update({ where: { id }, data: { status: 'paused' } })
    return this.get(ctx, id)
  }

  async resume(ctx: TenantContext, id: string) {
    const c = await this.get(ctx, id)
    if (c.status !== 'paused')
      throw new ValidationError('Só campanhas pausadas podem ser retomadas')
    await this.db.campaign.update({ where: { id }, data: { status: 'running' } })
    return this.get(ctx, id)
  }

  async cancel(ctx: TenantContext, id: string) {
    const c = await this.get(ctx, id)
    if (['completed', 'cancelled'].includes(c.status)) return c
    await this.db.$transaction([
      this.db.campaignRecipient.updateMany({
        where: { campaignId: id, status: 'pending' },
        data: { status: 'skipped', error: 'campaign_cancelled' },
      }),
      this.db.campaign.update({ where: { id }, data: { status: 'cancelled' } }),
    ])
    return this.get(ctx, id)
  }

  async recipients(ctx: TenantContext, id: string, status?: string, limit = 200) {
    await this.get(ctx, id)
    return this.db.campaignRecipient.findMany({
      where: { campaignId: id, ...(status ? { status } : {}) },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    })
  }

  async stats(id: string) {
    const rows = await this.db.campaignRecipient.groupBy({
      by: ['status'],
      where: { campaignId: id },
      _count: { _all: true },
    })
    const byStatus = Object.fromEntries(rows.map((r) => [r.status, r._count._all])) as Record<
      string,
      number
    >
    const total = rows.reduce((s, r) => s + r._count._all, 0)
    const sent =
      (byStatus['sent'] ?? 0) +
      (byStatus['delivered'] ?? 0) +
      (byStatus['read'] ?? 0) +
      (byStatus['replied'] ?? 0) +
      (byStatus['converted'] ?? 0)
    const replied = (byStatus['replied'] ?? 0) + (byStatus['converted'] ?? 0)
    return {
      total,
      byStatus,
      sent,
      replied,
      replyRate: sent ? replied / sent : 0,
      failed: byStatus['failed'] ?? 0,
      pending: byStatus['pending'] ?? 0,
    }
  }

  /**
   * Worker tick (every minute): starts due campaigns and sends one throttled batch per running
   * campaign inside its unit's send window. Idempotent: a recipient is sent at most once.
   */
  async processTick(
    now = new Date(),
    runAs?: <T>(tenantId: string, fn: () => Promise<T>) => Promise<T>,
  ) {
    await this.db.campaign.updateMany({
      where: { status: 'scheduled', scheduledAt: { lte: now } },
      data: { status: 'running' },
    })
    const running = await this.db.campaign.findMany({
      where: { status: 'running' },
      include: { unit: { select: { timezone: true, name: true } }, template: true },
    })
    const summary: Array<{
      campaignId: string
      sent: number
      failed: number
      skipped: number
      done: boolean
    }> = []
    for (const c of running) {
      const run = () => this.sendBatch(c, now)
      const r = runAs ? await runAs(c.tenantId, run) : await run()
      summary.push({ campaignId: c.id, ...r })
    }
    return summary
  }

  private async sendBatch(
    c: Prisma.CampaignGetPayload<{
      include: { unit: { select: { timezone: true; name: true } }; template: true }
    }>,
    now: Date,
  ) {
    const segment = (c.segment ?? {}) as CampaignSegment
    const result = { sent: 0, failed: 0, skipped: 0, done: false }
    if (!inSendWindow(segment.sendWindow, c.unit.timezone, now)) return result
    if (!c.template || c.template.status !== 'approved') {
      await this.db.campaign.update({
        where: { id: c.id },
        data: {
          status: 'paused',
          stats: { ...(c.stats as object), error: 'template_not_approved' },
        },
      })
      return result
    }
    const channel = await this.db.channel.findFirst({
      where: { unitId: c.unitId, kind: 'whatsapp', status: 'active' },
      orderBy: { createdAt: 'asc' },
    })
    if (!channel) {
      await this.db.campaign.update({
        where: { id: c.id },
        data: { status: 'paused', stats: { ...(c.stats as object), error: 'no_whatsapp_channel' } },
      })
      return result
    }
    const batch = await this.db.campaignRecipient.findMany({
      where: { campaignId: c.id, status: 'pending' },
      take: Math.max(1, c.rateLimitPerMin),
      orderBy: { updatedAt: 'asc' },
    })
    if (!batch.length) {
      await this.db.campaign.update({
        where: { id: c.id },
        data: {
          status: 'completed',
          stats: {
            ...(c.stats as object),
            ...(await this.stats(c.id)),
            completedAt: now.toISOString(),
          },
        },
      })
      return { ...result, done: true }
    }
    const ctx = systemContext(c.tenantId, `campaign:${c.id}`)
    const conversations = new ConversationService(this.db)
    const outbound = this.deps.providers
      ? new OutboundService(this.db, this.deps.providers, this.deps.realtime)
      : null
    for (const r of batch) {
      try {
        if (await ConsentService.isOptedOut(this.db, r.contactId)) {
          await this.db.campaignRecipient.update({
            where: { id: r.id },
            data: { status: 'unsubscribed' },
          })
          result.skipped++
          continue
        }
        const lead = r.leadId
          ? await this.db.lead.findUnique({
              where: { id: r.leadId },
              include: {
                contact: true,
                owner: { select: { name: true } },
                interestProduct: { select: { name: true } },
                recommendedProduct: { select: { name: true } },
              },
            })
          : null
        const contact =
          lead?.contact ?? (await this.db.contact.findUnique({ where: { id: r.contactId } }))
        if (!contact?.phone) {
          await this.db.campaignRecipient.update({
            where: { id: r.id },
            data: { status: 'skipped', error: 'no_phone' },
          })
          result.skipped++
          continue
        }
        const vars = renderVariables(c.variables as string[], {
          firstName: contact.firstName ?? contact.name?.split(' ')[0] ?? 'tudo bem',
          name: contact.name ?? '',
          productName:
            lead?.interestProduct?.name ??
            lead?.recommendedProduct?.name ??
            'seu desenvolvimento em comunicação',
          unitName: c.unit.name,
          ownerName: lead?.owner?.name ?? '',
          city: contact.city ?? '',
        })
        const { conversation } = await this.db.$transaction((tx: DbTx) =>
          conversations.getOrOpen(tx, ctx, {
            unitId: c.unitId,
            channelId: channel.id,
            contactId: r.contactId,
          }),
        )
        if (!outbound) throw new Error('providers unavailable')
        const msg = await outbound.send(
          ctx,
          conversation.id,
          {
            templateName: c.template.name,
            templateLanguage: c.template.language,
            templateVariables: vars.slice(0, c.template.variables.length || vars.length),
          },
          'system',
        )
        await this.db.campaignRecipient.update({
          where: { id: r.id },
          data: { status: 'sent', messageId: msg.id, sentAt: now },
        })
        result.sent++
      } catch (err) {
        this.deps.logger?.warn({ err, campaignId: c.id, recipientId: r.id }, 'campaign send failed')
        await this.db.campaignRecipient.update({
          where: { id: r.id },
          data: { status: 'failed', error: (err as Error).message.slice(0, 500) },
        })
        result.failed++
      }
    }
    await this.db.campaign.update({
      where: { id: c.id },
      data: {
        stats: {
          ...(c.stats as object),
          ...(await this.stats(c.id)),
          lastBatchAt: now.toISOString(),
        },
      },
    })
    return result
  }

  /** Inbound hook: a reply within 72h of a campaign send is attributed to the campaign. */
  static async markRepliedTx(tx: DbTx, contactId: string, at = new Date()) {
    return tx.campaignRecipient.updateMany({
      where: {
        contactId,
        status: { in: ['sent', 'delivered', 'read'] },
        sentAt: { gte: new Date(at.getTime() - REPLY_WINDOW_HOURS * 36e5) },
      },
      data: { status: 'replied' },
    })
  }

  private async assertTemplate(ctx: TenantContext, templateId: string | null, variables: string[]) {
    if (!templateId) return
    const tpl = await this.db.messageTemplate.findFirst({
      where: { id: templateId, tenantId: ctx.tenantId },
    })
    if (!tpl) throw new NotFoundError('MessageTemplate', templateId)
    if (tpl.status !== 'approved')
      throw new ValidationError(`Template "${tpl.name}" não está aprovado (${tpl.status})`)
    if (tpl.variables.length && variables.length < tpl.variables.length)
      throw new ValidationError(
        `O template "${tpl.name}" usa ${tpl.variables.length} variáveis; informe todas`,
      )
  }
}

export function renderVariables(mapping: string[], values: Record<string, string>): string[] {
  return mapping.map(
    (m) => m.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? '').trim() || '-',
  )
}

/** Local send window check ("08:00"–"20:00" in the unit's timezone); no window = always. */
export function inSendWindow(
  window: { start: string; end: string } | undefined,
  timezone: string,
  now: Date,
): boolean {
  if (!window?.start || !window?.end) return true
  const hm = formatInZone(now, timezone, 'HH:mm')
  return window.start <= window.end
    ? hm >= window.start && hm < window.end
    : hm >= window.start || hm < window.end
}
