import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { AppointmentInputSchema } from '@vox/shared'
import { AppointmentService, NotFoundError } from '@vox/core'

export const schedulingRoutes: FastifyPluginAsync = async (app) => {
  const service = new AppointmentService(app.ctx.db, app.ctx.providers.calendar)

  app.get('/appointments', { schema: { tags: ['scheduling'], querystring: z.object({ unitId: z.string().uuid().optional(), from: z.string().datetime().optional(), to: z.string().datetime().optional(), leadId: z.string().uuid().optional() }) }, preHandler: app.requireAuth('leads:read') }, async (req) => {
    const q = req.query as { unitId?: string; from?: string; to?: string; leadId?: string }
    return { items: await service.list(req.auth!, { unitId: q.unitId, leadId: q.leadId, from: q.from ? new Date(q.from) : undefined, to: q.to ? new Date(q.to) : undefined }) }
  })

  app.get('/appointments/slots', { schema: { tags: ['scheduling'], querystring: z.object({ unitId: z.string().uuid(), calendarId: z.string().uuid().optional(), from: z.string().datetime().optional(), days: z.coerce.number().int().min(1).max(30).optional(), durationMin: z.coerce.number().int().optional() }) }, preHandler: app.requireAuth('leads:read') }, async (req) => {
    const q = req.query as { unitId: string; calendarId?: string; from?: string; days?: number; durationMin?: number }
    const from = q.from ? new Date(q.from) : new Date()
    const to = new Date(from.getTime() + (q.days ?? 7) * 864e5)
    return { slots: await service.getAvailableSlots(req.auth!, q.unitId, { calendarId: q.calendarId, from, to, durationMin: q.durationMin, limit: 100 }) }
  })

  app.post('/appointments', { schema: { tags: ['scheduling'], body: AppointmentInputSchema.extend({ unitId: z.string().uuid() }) }, preHandler: app.requireAuth('leads:write') }, async (req) => {
    const body = req.body as z.infer<typeof AppointmentInputSchema> & { unitId: string }
    return service.create(req.auth!, { unitId: body.unitId, calendarId: body.calendarId, contactId: body.contactId, leadId: body.leadId, kind: body.kind, title: body.title, startsAt: new Date(body.startsAt), durationMin: body.durationMin, notes: body.notes, requireAvailability: false })
  })

  app.post('/appointments/:id/reschedule', { schema: { tags: ['scheduling'], params: z.object({ id: z.string().uuid() }), body: z.object({ startsAt: z.string().datetime() }) }, preHandler: app.requireAuth('leads:write') }, async (req) => {
    return service.reschedule(req.auth!, (req.params as { id: string }).id, new Date((req.body as { startsAt: string }).startsAt))
  })

  app.post('/appointments/:id/status', { schema: { tags: ['scheduling'], params: z.object({ id: z.string().uuid() }), body: z.object({ status: z.enum(['confirmed', 'completed', 'no_show', 'cancelled']) }) }, preHandler: app.requireAuth('leads:write') }, async (req) => {
    return service.setStatus(req.auth!, (req.params as { id: string }).id, (req.body as { status: 'confirmed' | 'completed' | 'no_show' | 'cancelled' }).status)
  })

  app.get('/calendars', { schema: { tags: ['scheduling'], querystring: z.object({ unitId: z.string().uuid() }) }, preHandler: app.requireAuth('leads:read') }, async (req) => {
    return { items: await app.ctx.db.calendar.findMany({ where: { unitId: (req.query as { unitId: string }).unitId, unit: { tenantId: req.auth!.tenantId } } }) }
  })

  app.put('/calendars/:id', { schema: { tags: ['scheduling'], params: z.object({ id: z.string().uuid() }), body: z.object({ name: z.string().optional(), availabilityRules: z.array(z.object({ weekday: z.number().int().min(1).max(7), start: z.string(), end: z.string() })).optional(), slotDurationMin: z.number().int().min(15).max(240).optional(), bufferMin: z.number().int().min(0).max(120).optional(), externalId: z.string().nullable().optional(), provider: z.enum(['internal', 'google']).optional() }) }, preHandler: app.requireAuth('settings:write') }, async (req) => {
    const id = (req.params as { id: string }).id
    const cal = await app.ctx.db.calendar.findFirst({ where: { id, unit: { tenantId: req.auth!.tenantId } } })
    if (!cal) throw new NotFoundError('Calendar', id)
    const body = req.body as Record<string, unknown>
    return app.ctx.db.calendar.update({ where: { id }, data: body as never })
  })
}
