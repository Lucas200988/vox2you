import type { Db } from '@vox/db'
import { addDays } from '@vox/shared'
import { emitEvent } from '../events/outbox.js'
import { NotFoundError, ValidationError } from '../errors.js'
import type { AvailableSlot, CalendarProvider, CalendarRef } from '../providers/calendar.js'
import type { TenantContext } from '../tenant/context.js'

export class AppointmentService {
  constructor(
    private readonly db: Db,
    private readonly calendar: CalendarProvider,
  ) {}

  async resolveCalendar(ctx: TenantContext, unitId: string, calendarId?: string): Promise<CalendarRef & { unitId: string }> {
    const row = calendarId
      ? await this.db.calendar.findFirst({ where: { id: calendarId, unit: { tenantId: ctx.tenantId } } })
      : (await this.db.calendar.findFirst({ where: { unitId, isDefault: true, unit: { tenantId: ctx.tenantId } } })) ??
        (await this.db.calendar.findFirst({ where: { unitId, unit: { tenantId: ctx.tenantId } } }))
    if (!row) throw new NotFoundError('Calendar')
    if (row.unitId !== unitId) throw new ValidationError('Calendar belongs to another unit')
    return {
      id: row.id,
      unitId: row.unitId,
      externalId: row.externalId,
      timezone: row.timezone,
      availabilityRules: (row.availabilityRules as CalendarRef['availabilityRules']) ?? [],
      slotDurationMin: row.slotDurationMin,
      bufferMin: row.bufferMin,
    }
  }

  async getAvailableSlots(ctx: TenantContext, unitId: string, params: { calendarId?: string; from?: Date; to?: Date; durationMin?: number; limit?: number }): Promise<AvailableSlot[]> {
    const calendar = await this.resolveCalendar(ctx, unitId, params.calendarId)
    const from = params.from ?? new Date()
    const to = params.to ?? addDays(from, 7)
    const busyRows = await this.db.appointment.findMany({
      where: { calendarId: calendar.id, status: { in: ['scheduled', 'confirmed'] }, startsAt: { lt: to }, endsAt: { gt: from } },
      select: { startsAt: true, endsAt: true },
    })
    const slots = await this.calendar.getAvailableSlots({ calendar, from, to, durationMin: params.durationMin, busy: busyRows.map((b) => ({ start: b.startsAt, end: b.endsAt })) })
    return slots.slice(0, params.limit ?? 40)
  }

  async create(ctx: TenantContext, input: { unitId: string; calendarId?: string; contactId: string; leadId?: string; kind?: string; title: string; startsAt: Date; durationMin?: number; notes?: string; requireAvailability?: boolean }) {
    const calendar = await this.resolveCalendar(ctx, input.unitId, input.calendarId)
    const duration = input.durationMin ?? calendar.slotDurationMin
    const endsAt = new Date(input.startsAt.getTime() + duration * 60000)
    if (input.requireAvailability !== false) {
      const slots = await this.getAvailableSlots(ctx, input.unitId, { calendarId: calendar.id, from: new Date(input.startsAt.getTime() - 1), to: endsAt, durationMin: duration, limit: 100 })
      const ok = slots.some((s) => s.start.getTime() === input.startsAt.getTime())
      if (!ok) throw new ValidationError('Selected time is not available')
    }
    const contact = await this.db.contact.findFirst({ where: { id: input.contactId, tenantId: ctx.tenantId } })
    if (!contact) throw new NotFoundError('Contact', input.contactId)

    const event = await this.calendar.createEvent({ calendar, title: input.title, description: input.notes, start: input.startsAt, end: endsAt, attendeeName: contact.name ?? undefined, attendeePhone: contact.phone ?? undefined, attendeeEmail: contact.email ?? undefined })
    return this.db.$transaction(async (tx) => {
      const appt = await tx.appointment.create({
        data: {
          tenantId: ctx.tenantId,
          unitId: input.unitId,
          calendarId: calendar.id,
          contactId: input.contactId,
          leadId: input.leadId ?? null,
          kind: input.kind ?? 'visit',
          title: input.title,
          startsAt: input.startsAt,
          endsAt,
          timezone: calendar.timezone,
          status: 'scheduled',
          externalId: event.externalId,
          notes: input.notes ?? null,
          createdBy: ctx.actor,
        },
      })
      await emitEvent(tx, { type: 'appointment.created', tenantId: ctx.tenantId, unitId: input.unitId, aggregateType: 'lead', aggregateId: input.leadId ?? input.contactId, payload: { appointmentId: appt.id, startsAt: appt.startsAt, kind: appt.kind, contactId: input.contactId, leadId: input.leadId ?? null }, actor: ctx.actor })
      return appt
    })
  }

  async reschedule(ctx: TenantContext, id: string, startsAt: Date) {
    const appt = await this.db.appointment.findFirst({ where: { id, tenantId: ctx.tenantId } })
    if (!appt) throw new NotFoundError('Appointment', id)
    const calendar = await this.resolveCalendar(ctx, appt.unitId, appt.calendarId)
    const endsAt = new Date(startsAt.getTime() + (appt.endsAt.getTime() - appt.startsAt.getTime()))
    if (appt.externalId) await this.calendar.rescheduleEvent(calendar, appt.externalId, startsAt, endsAt)
    return this.db.$transaction(async (tx) => {
      const updated = await tx.appointment.update({ where: { id }, data: { startsAt, endsAt, status: 'scheduled' } })
      await emitEvent(tx, { type: 'appointment.rescheduled', tenantId: ctx.tenantId, unitId: appt.unitId, aggregateType: 'lead', aggregateId: appt.leadId ?? appt.contactId, payload: { appointmentId: id, startsAt }, actor: ctx.actor })
      return updated
    })
  }

  async setStatus(ctx: TenantContext, id: string, status: 'confirmed' | 'completed' | 'no_show' | 'cancelled') {
    const appt = await this.db.appointment.findFirst({ where: { id, tenantId: ctx.tenantId } })
    if (!appt) throw new NotFoundError('Appointment', id)
    if (status === 'cancelled' && appt.externalId) {
      const calendar = await this.resolveCalendar(ctx, appt.unitId, appt.calendarId)
      await this.calendar.cancelEvent(calendar, appt.externalId)
    }
    const eventType = status === 'cancelled' ? 'appointment.cancelled' : status === 'completed' ? 'appointment.completed' : status === 'no_show' ? 'appointment.no_show' : null
    return this.db.$transaction(async (tx) => {
      const updated = await tx.appointment.update({ where: { id }, data: { status } })
      if (eventType) await emitEvent(tx, { type: eventType, tenantId: ctx.tenantId, unitId: appt.unitId, aggregateType: 'lead', aggregateId: appt.leadId ?? appt.contactId, payload: { appointmentId: id, leadId: appt.leadId, contactId: appt.contactId }, actor: ctx.actor })
      return updated
    })
  }

  async list(ctx: TenantContext, filters: { unitId?: string; from?: Date; to?: Date; leadId?: string }) {
    return this.db.appointment.findMany({
      where: { tenantId: ctx.tenantId, ...(filters.unitId ? { unitId: filters.unitId } : {}), ...(filters.leadId ? { leadId: filters.leadId } : {}), ...(filters.from || filters.to ? { startsAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } } : {}) },
      include: { contact: { select: { id: true, name: true, phone: true } }, lead: { select: { id: true, stage: { select: { name: true } } } } },
      orderBy: { startsAt: 'asc' },
    })
  }
}
