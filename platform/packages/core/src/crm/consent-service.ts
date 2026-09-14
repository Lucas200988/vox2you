import type { DbTx } from '@vox/db'
import { emitEvent } from '../events/outbox.js'
import type { TenantContext } from '../tenant/context.js'

export type ConsentPurpose = 'marketing' | 'service' | 'ai_processing'

export class ConsentService {
  static async set(
    tx: DbTx,
    ctx: TenantContext,
    contactId: string,
    purpose: ConsentPurpose,
    status: 'opted_in' | 'opted_out',
    source: string,
    evidence?: string,
  ) {
    const now = new Date()
    const consent = await tx.consent.upsert({
      where: { contactId_purpose: { contactId, purpose } },
      update: { status, source, evidence: evidence ?? null, ...(status === 'opted_in' ? { grantedAt: now, revokedAt: null } : { revokedAt: now }) },
      create: { tenantId: ctx.tenantId, contactId, purpose, status, source, evidence: evidence ?? null, grantedAt: status === 'opted_in' ? now : null, revokedAt: status === 'opted_out' ? now : null },
    })
    await emitEvent(tx, {
      type: status === 'opted_in' ? 'consent.granted' : 'consent.revoked',
      tenantId: ctx.tenantId,
      aggregateType: 'contact',
      aggregateId: contactId,
      payload: { purpose, source },
      actor: ctx.actor,
    })
    return consent
  }

  /** Opt-out of marketing: cancels scheduled follow-ups and campaign sends for the contact. */
  static async optOutMarketing(tx: DbTx, ctx: TenantContext, contactId: string, evidence: string) {
    await ConsentService.set(tx, ctx, contactId, 'marketing', 'opted_out', 'inbound_message', evidence)
    await tx.followUp.updateMany({
      where: { tenantId: ctx.tenantId, status: 'scheduled', lead: { contactId } },
      data: { status: 'cancelled', skipReason: 'opt_out' },
    })
    await tx.campaignRecipient.updateMany({
      where: { contactId, status: 'pending' },
      data: { status: 'unsubscribed' },
    })
    await tx.lead.updateMany({ where: { contactId, status: 'open' }, data: { nextFollowupAt: null, nextFollowupReason: 'opt_out' } })
  }

  static async canMarket(tx: DbTx, contactId: string): Promise<boolean> {
    const c = await tx.consent.findUnique({ where: { contactId_purpose: { contactId, purpose: 'marketing' } } })
    return c?.status === 'opted_in'
  }

  static async isOptedOut(tx: DbTx, contactId: string): Promise<boolean> {
    const c = await tx.consent.findUnique({ where: { contactId_purpose: { contactId, purpose: 'marketing' } } })
    return c?.status === 'opted_out'
  }
}
