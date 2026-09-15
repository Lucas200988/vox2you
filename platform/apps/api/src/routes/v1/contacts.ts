import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { ConsentService, ContactService } from '@vox/core'

const IdParams = z.object({ id: z.string().uuid() })

export const contactRoutes: FastifyPluginAsync = async (app) => {
  const contacts = new ContactService(app.ctx.db)

  app.get('/', { schema: { tags: ['crm'], querystring: z.object({ q: z.string().optional(), limit: z.coerce.number().int().min(1).max(200).optional() }) }, preHandler: [app.requireAuth(), app.requireScope('contacts:read')] }, async (req) => {
    const q = req.query as { q?: string; limit?: number }
    return { items: await contacts.search(req.auth!, q.q, q.limit) }
  })

  app.get('/:id', { schema: { tags: ['crm'], params: IdParams }, preHandler: [app.requireAuth(), app.requireScope('contacts:read')] }, async (req) => {
    return contacts.get(req.auth!, (req.params as z.infer<typeof IdParams>).id)
  })

  app.patch('/:id', { schema: { tags: ['crm'], params: IdParams, body: z.object({ name: z.string().optional(), email: z.string().email().optional(), jobTitle: z.string().optional(), city: z.string().optional(), profileType: z.enum(['b2c', 'b2b']).optional(), companyName: z.string().optional() }) }, preHandler: [app.requireAuth('contacts:write'), app.requireScope('contacts:write')] }, async (req) => {
    return contacts.update(req.auth!, (req.params as z.infer<typeof IdParams>).id, req.body as Parameters<ContactService['update']>[2])
  })

  app.get('/:id/export', { schema: { tags: ['crm'], params: IdParams }, preHandler: app.requireAuth('contacts:export') }, async (req) => {
    const id = (req.params as z.infer<typeof IdParams>).id
    const data = await contacts.export(req.auth!, id)
    await app.ctx.db.auditLog.create({ data: { tenantId: req.auth!.tenantId, userId: req.auth!.userId ?? null, actor: req.auth!.actor, action: 'contact.export', entityType: 'contact', entityId: id, ip: req.ip } })
    return data
  })

  app.delete('/:id', { schema: { tags: ['crm'], params: IdParams }, preHandler: app.requireAuth('contacts:delete') }, async (req) => {
    await contacts.anonymize(req.auth!, (req.params as z.infer<typeof IdParams>).id)
    return { ok: true, anonymized: true }
  })

  app.post('/:id/consents', { schema: { tags: ['crm'], params: IdParams, body: z.object({ purpose: z.enum(['marketing', 'service', 'ai_processing']), status: z.enum(['opted_in', 'opted_out']), evidence: z.string().optional() }) }, preHandler: app.requireAuth('contacts:write') }, async (req) => {
    const id = (req.params as z.infer<typeof IdParams>).id
    await contacts.get(req.auth!, id)
    const body = req.body as { purpose: 'marketing' | 'service' | 'ai_processing'; status: 'opted_in' | 'opted_out'; evidence?: string }
    await app.ctx.db.$transaction(async (tx) => {
      if (body.status === 'opted_out' && body.purpose === 'marketing') await ConsentService.optOutMarketing(tx, req.auth!, id, body.evidence ?? 'user')
      else await ConsentService.set(tx, req.auth!, id, body.purpose, body.status, 'user', body.evidence)
    })
    return { ok: true }
  })
}
