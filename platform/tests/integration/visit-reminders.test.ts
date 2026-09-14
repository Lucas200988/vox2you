import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppointmentService, VisitReminderService, createLogger, systemContext } from '@vox/core'
import { inbound, randomPhone, RUN, setupTestEnv, type TestEnv } from './helpers.js'

/**
 * Reminders 24h/2h before a visit and outcome handling after it: text inside the WhatsApp window,
 * a consultant task when nothing can be sent, no duplicates, no-show → follow-up.
 */
describe.skipIf(!RUN)('visit reminders and outcomes', () => {
  let env: TestEnv
  let service: VisitReminderService
  let appointments: AppointmentService
  const logger = createLogger('test', 'silent')

  beforeAll(async () => {
    env = await setupTestEnv()
    service = new VisitReminderService(env.db, env.providers, logger, env.realtime)
    appointments = new AppointmentService(env.db, env.providers.calendar)
  })
  afterAll(async () => {
    await env?.db.$disconnect()
  })

  async function leadWithConversation(name: string) {
    const phone = randomPhone()
    const res = await inbound(env, phone, 'Oi, quero conhecer a escola', { name })
    return {
      phone,
      contactId: res.contactId!,
      leadId: res.leadId!,
      conversationId: res.conversationId!,
    }
  }

  it('sends the 24h reminder as text inside the window, once, with date and address', async () => {
    const { contactId, leadId } = await leadWithConversation('Bia Lembrete')
    await env.db.unit.update({
      where: { id: env.seed.unitId },
      data: { address: 'Av. Teste, 100 - Centro' },
    })
    const startsAt = new Date(Date.now() + 23 * 36e5)
    const appt = await appointments.create(systemContext(env.seed.tenantId), {
      unitId: env.seed.unitId,
      contactId,
      leadId,
      title: 'Visita',
      startsAt,
      requireAvailability: false,
    })
    const before = env.messaging.sent.length
    const first = await service.sendDueReminders()
    expect(first.find((r) => r.appointmentId === appt.id)).toMatchObject({
      kind: '24h',
      via: 'text',
    })
    expect(env.messaging.sent.length).toBe(before + 1)
    const text = (env.messaging.sent.at(-1)!.payload as { text?: string }).text ?? ''
    expect(text).toContain('Bia')
    expect(text).toContain('Av. Teste, 100')
    expect(text).toMatch(/\d{2}\/\d{2}/)
    const again = await service.sendDueReminders()
    expect(again.find((r) => r.appointmentId === appt.id)).toBeUndefined()
    const row = await env.db.appointment.findUnique({ where: { id: appt.id } })
    expect(row?.reminder24hSentAt).toBeTruthy()
  })

  it('uses the approved template when the window is closed, and a consultant task when there is none', async () => {
    const closeWindow = (conversationId: string) =>
      env.db.conversation.update({
        where: { id: conversationId },
        data: { lastInboundAt: new Date(Date.now() - 30 * 36e5) },
      })
    const ctx = systemContext(env.seed.tenantId)
    const startsAt = new Date(Date.now() + 90 * 60e3)

    // 1) window closed + approved template (seeded as lembrete_visita) → template
    const a = await leadWithConversation('Caio Template')
    await closeWindow(a.conversationId)
    const apptA = await appointments.create(ctx, {
      unitId: env.seed.unitId,
      contactId: a.contactId,
      leadId: a.leadId,
      title: 'Visita',
      startsAt,
      requireAvailability: false,
    })
    let before = env.messaging.sent.length
    let res = await service.sendDueReminders()
    expect(res.find((r) => r.appointmentId === apptA.id)).toMatchObject({
      kind: '2h',
      via: 'template',
    })
    expect(env.messaging.sent.length).toBe(before + 1)
    expect(env.messaging.sent.at(-1)!.kind).toBe('template')

    // 2) window closed and no approved template → task for the consultant, nothing sent
    const template = await env.db.messageTemplate.findFirst({
      where: { tenantId: env.seed.tenantId, name: 'lembrete_visita' },
    })
    await env.db.messageTemplate.update({ where: { id: template!.id }, data: { status: 'paused' } })
    try {
      const b = await leadWithConversation('Caio Tarefa')
      await closeWindow(b.conversationId)
      const apptB = await appointments.create(ctx, {
        unitId: env.seed.unitId,
        contactId: b.contactId,
        leadId: b.leadId,
        title: 'Visita',
        startsAt,
        requireAvailability: false,
      })
      before = env.messaging.sent.length
      res = await service.sendDueReminders()
      expect(res.find((r) => r.appointmentId === apptB.id)).toMatchObject({
        kind: '2h',
        via: 'task',
      })
      expect(env.messaging.sent.length).toBe(before)
      const task = await env.db.task.findFirst({
        where: { leadId: b.leadId, kind: 'call' },
        orderBy: { createdAt: 'desc' },
      })
      expect(task?.title).toContain('Caio Tarefa')
      expect(task?.priority).toBe('urgent')
    } finally {
      await env.db.messageTemplate.update({
        where: { id: template!.id },
        data: { status: 'approved' },
      })
    }
  })

  it('prompts for the outcome after the visit and marks no-show a day later with a follow-up', async () => {
    const { contactId, leadId } = await leadWithConversation('Dani Faltou')
    const startsAt = new Date(Date.now() - 30 * 36e5)
    const appt = await appointments.create(systemContext(env.seed.tenantId), {
      unitId: env.seed.unitId,
      contactId,
      leadId,
      title: 'Visita',
      startsAt,
      requireAvailability: false,
    })
    const r = await service.handleOverdue()
    expect(r.prompted).toBeGreaterThanOrEqual(1)
    expect(r.noShow).toBeGreaterThanOrEqual(1)
    const row = await env.db.appointment.findUnique({ where: { id: appt.id } })
    expect(row?.status).toBe('no_show')
    expect(row?.outcomePromptedAt).toBeTruthy()
    const task = await env.db.task.findFirst({ where: { leadId, kind: 'visit' } })
    expect(task?.title).toContain('compareceu ou faltou')
    const followUp = await env.db.followUp.findFirst({ where: { leadId, status: 'scheduled' } })
    expect(followUp?.scenario).toBe('no_show')
    const lead = await env.db.lead.findUnique({ where: { id: leadId } })
    expect(lead?.nextBestAction).toContain('reagendar')
    // idempotent: a second pass does nothing more for this appointment
    const again = await service.handleOverdue()
    expect(again.noShow).toBe(0)
  })
})
