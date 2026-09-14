import type { Db, DbTx } from '@vox/db'
import { normalizePhone, sha256 } from '@vox/shared'
import { emitEvent } from '../events/outbox.js'
import { NotFoundError } from '../errors.js'
import type { TenantContext } from '../tenant/context.js'

export interface IdentifyInput {
  channel: string // whatsapp | instagram | ...
  externalId: string // wa_id
  displayName?: string
  source?: string
}

export class ContactService {
  constructor(private readonly db: Db) {}

  /**
   * Finds a contact by channel identity, creating contact + identity when unknown.
   * Also links by normalized phone when the identity is new but the phone already exists.
   */
  async findOrCreateByIdentity(tx: DbTx, ctx: TenantContext, input: IdentifyInput) {
    const existing = await tx.contactIdentity.findUnique({
      where: { tenantId_channel_externalId: { tenantId: ctx.tenantId, channel: input.channel, externalId: input.externalId } },
      include: { contact: true },
    })
    if (existing) {
      if (!existing.contact.name && input.displayName) {
        await tx.contact.update({ where: { id: existing.contactId }, data: { name: input.displayName, firstName: input.displayName.split(' ')[0] ?? null } })
      }
      return { contact: existing.contact, created: false }
    }

    const phone = input.channel === 'whatsapp' ? normalizePhone(input.externalId) : null
    let contact = phone
      ? await tx.contact.findFirst({ where: { tenantId: ctx.tenantId, phone, isAnonymized: false } })
      : null
    let created = false
    if (!contact) {
      contact = await tx.contact.create({
        data: {
          tenantId: ctx.tenantId,
          name: input.displayName ?? null,
          firstName: input.displayName?.split(' ')[0] ?? null,
          phone,
          source: input.source ?? `${input.channel}_organic`,
          lastSeenAt: new Date(),
        },
      })
      created = true
      await emitEvent(tx, {
        type: 'contact.created',
        tenantId: ctx.tenantId,
        aggregateType: 'contact',
        aggregateId: contact.id,
        payload: { channel: input.channel, source: contact.source },
        actor: ctx.actor,
      })
    }
    await tx.contactIdentity.create({
      data: { tenantId: ctx.tenantId, contactId: contact.id, channel: input.channel, externalId: input.externalId, displayName: input.displayName ?? null },
    })
    return { contact, created }
  }

  async get(ctx: TenantContext, id: string) {
    const contact = await this.db.contact.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { identities: true, company: true, consents: true, tags: { include: { tag: true } }, attribution: { orderBy: { createdAt: 'desc' }, take: 5 } },
    })
    if (!contact) throw new NotFoundError('Contact', id)
    return contact
  }

  async search(ctx: TenantContext, q: string | undefined, limit = 50) {
    return this.db.contact.findMany({
      where: {
        tenantId: ctx.tenantId,
        isAnonymized: false,
        ...(q
          ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q.replace(/\D/g, '') } }, { email: { contains: q, mode: 'insensitive' } }] }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    })
  }

  async update(ctx: TenantContext, id: string, data: { name?: string; email?: string; jobTitle?: string; city?: string; profileType?: string; companyName?: string }) {
    const contact = await this.get(ctx, id)
    let companyId = contact.companyId
    if (data.companyName) {
      const company = await this.db.company.upsert({
        where: { id: contact.companyId ?? '00000000-0000-0000-0000-000000000000' },
        update: { name: data.companyName },
        create: { tenantId: ctx.tenantId, name: data.companyName },
      })
      companyId = company.id
    }
    return this.db.contact.update({
      where: { id },
      data: {
        name: data.name ?? undefined,
        firstName: data.name ? (data.name.split(' ')[0] ?? null) : undefined,
        email: data.email ?? undefined,
        jobTitle: data.jobTitle ?? undefined,
        city: data.city ?? undefined,
        profileType: data.profileType ?? undefined,
        companyId,
      },
    })
  }

  /** LGPD: right of access / portability */
  async export(ctx: TenantContext, id: string) {
    const contact = await this.get(ctx, id)
    const [leads, conversations] = await Promise.all([
      this.db.lead.findMany({ where: { contactId: id }, include: { facts: true, stage: true } }),
      this.db.conversation.findMany({ where: { contactId: id }, include: { messages: { orderBy: { createdAt: 'asc' } } } }),
    ])
    return { contact, leads, conversations, exportedAt: new Date().toISOString() }
  }

  /** LGPD: erasure via anonymization (keeps aggregates, removes identifiers and content) */
  async anonymize(ctx: TenantContext, id: string) {
    const contact = await this.get(ctx, id)
    const token = sha256(`${contact.id}:${Date.now()}`).slice(0, 12)
    await this.db.$transaction(async (tx) => {
      await tx.contact.update({
        where: { id },
        data: { name: `Anonimizado ${token}`, firstName: null, phone: null, email: null, jobTitle: null, city: null, attributes: {}, isAnonymized: true },
      })
      await tx.contactIdentity.deleteMany({ where: { contactId: id } })
      await tx.message.updateMany({ where: { conversation: { contactId: id } }, data: { text: '[removido]', transcript: null, payload: {} } })
      await tx.leadFact.deleteMany({ where: { lead: { contactId: id } } })
      await tx.attachment.deleteMany({ where: { message: { conversation: { contactId: id } } } })
      await tx.auditLog.create({
        data: { tenantId: ctx.tenantId, userId: ctx.userId ?? null, actor: ctx.actor, action: 'contact.anonymize', entityType: 'contact', entityId: id },
      })
    })
  }
}
