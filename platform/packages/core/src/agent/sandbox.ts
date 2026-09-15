import type { Db } from '@vox/db'
import { ConversationService } from '../crm/conversation-service.js'
import { LeadService } from '../crm/lead-service.js'
import { NotFoundError } from '../errors.js'
import { assertUnitAccess, type TenantContext } from '../tenant/context.js'

/**
 * Sandbox conversations for the playground and dataset runs: a dedicated "playground" channel per
 * unit, one throwaway contact/lead per conversation. Nothing reaches WhatsApp; CRM effects stay on
 * the sandbox lead.
 */
export async function openSandboxConversation(
  db: Db,
  ctx: TenantContext,
  unitId: string,
  opts: { conversationId?: string; label?: string } = {},
) {
  assertUnitAccess(ctx, unitId)
  if (opts.conversationId) {
    const existing = await db.conversation.findFirst({
      where: { id: opts.conversationId, tenantId: ctx.tenantId, channel: { kind: 'playground' } },
    })
    if (!existing) throw new NotFoundError('Playground conversation', opts.conversationId)
    return existing
  }
  const channel = await db.channel.upsert({
    where: { kind_externalId: { kind: 'playground', externalId: `playground-${unitId}` } },
    update: {},
    create: {
      tenantId: ctx.tenantId,
      unitId,
      kind: 'playground',
      provider: 'mock',
      externalId: `playground-${unitId}`,
      name: 'Playground',
    },
  })
  const stamp = Date.now()
  return db.$transaction(async (tx) => {
    const contact = await tx.contact.create({
      data: {
        tenantId: ctx.tenantId,
        name: `${opts.label ?? 'Playground'} ${ctx.userId?.slice(0, 6) ?? 'user'} ${stamp}`,
        source: 'playground',
        attributes: { playground: true, userId: ctx.userId ?? null, label: opts.label ?? null },
      },
    })
    await tx.contactIdentity.create({
      data: {
        tenantId: ctx.tenantId,
        contactId: contact.id,
        channel: 'playground',
        externalId: `pg-${contact.id}`,
      },
    })
    const { conversation } = await new ConversationService(db).getOrOpen(tx, ctx, {
      unitId,
      channelId: channel.id,
      contactId: contact.id,
    })
    const { lead } = await new LeadService(db).getOrCreateOpen(tx, ctx, {
      unitId,
      contactId: contact.id,
      source: 'playground',
    })
    return tx.conversation.update({
      where: { id: conversation.id },
      data: { leadId: lead.id, metadata: { playground: true } },
    })
  })
}
