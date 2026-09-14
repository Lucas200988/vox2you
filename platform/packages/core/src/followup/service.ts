import type { Db, DbTx } from '@vox/db'
import { isQuietHours, nextAllowedTime } from '@vox/shared'
import { emitEvent } from '../events/outbox.js'
import type { TenantContext } from '../tenant/context.js'
import { ConsentService } from '../crm/consent-service.js'

export interface FollowUpPolicyResolved {
  maxPerWeek: number
  minHoursBetween: number
  maxAttempts: number
  quietHoursStart: string
  quietHoursEnd: string
  strategies: Record<string, { delayHours?: number; goal?: string }>
}

export async function loadFollowUpPolicy(db: Db | DbTx, unitId: string): Promise<FollowUpPolicyResolved> {
  const row = await db.followUpPolicy.findUnique({ where: { unitId } })
  return {
    maxPerWeek: row?.maxPerWeek ?? 3,
    minHoursBetween: row?.minHoursBetween ?? 20,
    maxAttempts: row?.maxAttempts ?? 4,
    quietHoursStart: row?.quietHoursStart ?? '21:00',
    quietHoursEnd: row?.quietHoursEnd ?? '08:00',
    strategies: (row?.strategies as FollowUpPolicyResolved['strategies'] | null) ?? {},
  }
}

export class FollowUpService {
  constructor(private readonly db: Db) {}

  /** Schedules (or replaces) the pending follow-up for a lead, enforcing quiet hours and frequency limits. */
  static async scheduleTx(
    tx: DbTx,
    ctx: TenantContext,
    params: { leadId: string; conversationId?: string; unitId: string; timezone: string; scheduledAt: Date; reason: string; goal?: string; scenario?: string; strategy?: string; policy: FollowUpPolicyResolved },
  ) {
    const lead = await tx.lead.findFirst({ where: { id: params.leadId, tenantId: ctx.tenantId }, select: { contactId: true, doNotContactUntil: true } })
    if (!lead) return null
    if (await ConsentService.isOptedOut(tx, lead.contactId)) return null

    let at = params.scheduledAt
    if (lead.doNotContactUntil && lead.doNotContactUntil > at) at = lead.doNotContactUntil
    if (isQuietHours(at, params.timezone, params.policy.quietHoursStart, params.policy.quietHoursEnd)) at = nextAllowedTime(at, params.timezone, params.policy.quietHoursStart, params.policy.quietHoursEnd)

    const weekAgo = new Date(Date.now() - 7 * 864e5)
    const sentThisWeek = await tx.followUp.count({ where: { leadId: params.leadId, status: 'sent', sentAt: { gte: weekAgo } } })
    if (sentThisWeek >= params.policy.maxPerWeek) return null
    const lastSent = await tx.followUp.findFirst({ where: { leadId: params.leadId, status: 'sent' }, orderBy: { sentAt: 'desc' } })
    if (lastSent?.sentAt) {
      const minNext = new Date(lastSent.sentAt.getTime() + params.policy.minHoursBetween * 36e5)
      if (at < minNext) at = minNext
    }
    const attempts = await tx.followUp.count({ where: { leadId: params.leadId, status: 'sent' } })

    await tx.followUp.updateMany({ where: { leadId: params.leadId, status: 'scheduled' }, data: { status: 'cancelled', skipReason: 'replaced' } })
    const fu = await tx.followUp.create({
      data: {
        tenantId: ctx.tenantId,
        leadId: params.leadId,
        conversationId: params.conversationId ?? null,
        scheduledAt: at,
        reason: params.reason,
        goal: params.goal ?? null,
        scenario: params.scenario ?? null,
        strategy: params.strategy ?? 'text',
        attempt: attempts + 1,
        createdBy: ctx.actor,
      },
    })
    await tx.lead.update({ where: { id: params.leadId }, data: { nextFollowupAt: at, nextFollowupReason: params.reason } })
    await emitEvent(tx, { type: 'followup.scheduled', tenantId: ctx.tenantId, unitId: params.unitId, aggregateType: 'lead', aggregateId: params.leadId, payload: { followUpId: fu.id, scheduledAt: at, reason: params.reason, scenario: params.scenario }, actor: ctx.actor })
    return fu
  }

  /** The customer replied: pending follow-ups are no longer needed. */
  static async cancelPendingTx(tx: DbTx, leadId: string, reason = 'customer_replied') {
    const res = await tx.followUp.updateMany({ where: { leadId, status: 'scheduled' }, data: { status: 'cancelled', skipReason: reason } })
    if (res.count) await tx.lead.update({ where: { id: leadId }, data: { nextFollowupAt: null, nextFollowupReason: null } })
    return res.count
  }

  async listDue(now = new Date(), limit = 50) {
    return this.db.followUp.findMany({
      where: { status: 'scheduled', scheduledAt: { lte: now } },
      include: { lead: { include: { contact: true, unit: true, stage: true } }, conversation: { include: { channel: true } } },
      orderBy: { scheduledAt: 'asc' },
      take: limit,
    })
  }

  async markSent(id: string, messageId?: string) {
    return this.db.$transaction(async (tx) => {
      const fu = await tx.followUp.update({ where: { id }, data: { status: 'sent', sentAt: new Date(), draftMessage: undefined } })
      await tx.lead.update({ where: { id: fu.leadId }, data: { nextFollowupAt: null } })
      await emitEvent(tx, { type: 'followup.sent', tenantId: fu.tenantId, aggregateType: 'lead', aggregateId: fu.leadId, payload: { followUpId: id, messageId, attempt: fu.attempt, scenario: fu.scenario }, actor: 'agent' })
      return fu
    })
  }

  async skip(id: string, reason: string) {
    return this.db.followUp.update({ where: { id }, data: { status: 'skipped', skipReason: reason } })
  }

  async listForLead(ctx: TenantContext, leadId: string) {
    return this.db.followUp.findMany({ where: { leadId, tenantId: ctx.tenantId }, orderBy: { createdAt: 'desc' } })
  }
}
