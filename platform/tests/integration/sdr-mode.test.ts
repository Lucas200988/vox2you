import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inbound, randomPhone, RUN, setSalesMode, setupTestEnv, type TestEnv } from './helpers.js'

/**
 * SDR mode: the agent qualifies and books the in-person visit. It never presents products or
 * quotes prices/installments/discounts, even though the catalog (with prices) is loaded for the
 * validation layer.
 */
describe.skipIf(!RUN)('SDR mode: qualify → book the visit, never quote', () => {
  let env: TestEnv
  beforeAll(async () => {
    env = await setupTestEnv()
    await setSalesMode(env, 'sdr')
  })
  afterAll(async () => {
    await env?.db.$disconnect()
  })

  it('answers a price question by inviting to the visit with real slots and no amounts', async () => {
    const phone = randomPhone()
    await inbound(env, phone, 'Oi, tenho muita vergonha de falar em público no trabalho')
    const res = await inbound(env, phone, 'Quanto custa o curso? Tem parcelamento?')
    expect(res.run?.decision).toBe('reply')
    expect(res.run?.validation?.ok).toBe(true)
    const reply = res.run!.reply!
    expect(reply).not.toMatch(/R\$|\d{1,2}\s?x\b|desconto/i)
    expect(reply).toMatch(/visita|unidade|conhecer/i)
    // slots were fetched so the invitation is concrete, and the catalog stayed loaded for validation
    const run = await env.db.agentRun.findUnique({
      where: { id: res.run!.runId },
      include: { toolCalls: true },
    })
    const tools = run!.toolCalls.map((t) => t.name)
    expect(tools).toEqual(expect.arrayContaining(['get_catalog', 'get_available_slots']))
    const lead = await env.db.lead.findUnique({
      where: { id: res.leadId },
      include: { stage: true },
    })
    expect(lead!.stage.key).not.toBe('offer')
    expect(['conversing', 'discovery', 'qualified']).toContain(lead!.stage.key)
  })

  it('blocks a generated reply that quotes a catalog price and falls back safely', async () => {
    const phone = randomPhone()
    env.llm.enqueue(
      {
        reply: 'O Academy custa R$ 3.990,00 ou 12x de R$ 332,50.',
        actions: [],
        usedSources: [],
        confidence: 0.9,
      },
      'generate',
    )
    env.llm.enqueue(
      { reply: 'São R$ 3.990,00 mesmo.', actions: [], usedSources: [], confidence: 0.9 },
      'generate',
    )
    const res = await inbound(env, phone, 'quanto custa o academy?')
    expect(res.run?.decision).toBe('blocked')
    expect(res.run?.validation?.issues.some((i) => i.code === 'sdr_price_mention')).toBe(true)
    expect(res.run?.reply ?? '').not.toMatch(/R\$/)
  })

  it('books the visit when the customer confirms a proposed slot and moves the lead to scheduling', async () => {
    const phone = randomPhone()
    const first = await inbound(env, phone, 'Quero visitar a escola pra conhecer')
    expect(first.run?.decision).toBe('reply')
    expect(first.run?.reply).toMatch(/reservar|visita|unidade/i)
    const second = await inbound(env, phone, 'Pode confirmar a visita nesse horário')
    expect(second.run?.decision).toBe('reply')
    const appointments = await env.db.appointment.findMany({ where: { leadId: second.leadId } })
    expect(appointments.length).toBe(1)
    const lead = await env.db.lead.findUnique({
      where: { id: second.leadId },
      include: { stage: true },
    })
    expect(lead!.stage.key).toBe('scheduling')
  })

  it('reschedules and then cancels the booked visit from the conversation (no second visit)', async () => {
    const phone = randomPhone()
    await inbound(env, phone, 'Quero visitar a escola pra conhecer')
    const booked = await inbound(env, phone, 'Pode confirmar a visita nesse horário')
    const before = await env.db.appointment.findMany({ where: { leadId: booked.leadId } })
    expect(before.length).toBe(1)
    const original = before[0]!

    // "remarcar" → the agent proposes another free slot instead of booking a second visit
    const ask = await inbound(env, phone, 'Quero remarcar a visita para outro horário')
    expect(ask.run?.decision).toBe('reply')
    expect(ask.run?.reply).toMatch(/mudar|remarcar|troca/i)
    const confirm = await inbound(env, phone, 'Pode confirmar a visita nesse novo horário')
    expect(confirm.run?.decision).toBe('reply')
    const afterReschedule = await env.db.appointment.findMany({ where: { leadId: booked.leadId } })
    expect(afterReschedule.length).toBe(1)
    expect(afterReschedule[0]!.id).toBe(original.id)
    expect(afterReschedule[0]!.status).toBe('scheduled')
    expect(afterReschedule[0]!.startsAt.getTime()).not.toBe(original.startsAt.getTime())
    const run = await env.db.agentRun.findUnique({
      where: { id: confirm.run!.runId },
      include: { toolCalls: true },
    })
    expect(run!.toolCalls.map((t) => t.name)).toContain('reschedule_appointment')

    // "cancelar" → the visit is cancelled and a follow-up is planned to re-book later
    const cancel = await inbound(env, phone, 'Vou precisar cancelar a visita')
    expect(cancel.run?.decision).toBe('reply')
    const afterCancel = await env.db.appointment.findUnique({ where: { id: original.id } })
    expect(afterCancel!.status).toBe('cancelled')
    expect(cancel.run?.followUpAt).toBeTruthy()
    const followUps = await env.db.followUp.findMany({
      where: { leadId: booked.leadId, status: 'scheduled' },
    })
    expect(followUps.length).toBe(1)
  })

  it('exposes the mode through resolved agent settings', async () => {
    const { loadAgentSettings } = await import('@vox/core')
    const settings = await loadAgentSettings(env.db, env.seed.unitId, env.providers.models)
    expect(settings.salesMode).toBe('sdr')
    expect(settings.visitLabel).toBeTruthy()
  })
})
