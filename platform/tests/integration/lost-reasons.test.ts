import { LeadService, suggestLostReason, systemContext } from '@vox/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inbound, randomPhone, RUN, setSalesMode, setupTestEnv, type TestEnv } from './helpers.js'

/** Lost reason suggested by the AI from the conversation, confirmed (or changed) by the human. */
describe.skipIf(!RUN)('Lost reasons: AI suggestion vs human confirmation', () => {
  let env: TestEnv
  beforeAll(async () => {
    env = await setupTestEnv()
    await setSalesMode(env, 'sdr')
  })
  afterAll(async () => {
    await env?.db.$disconnect()
  })

  it('suggests "price" after a price objection and records it as AI-suggested when kept', async () => {
    const phone = randomPhone()
    await inbound(env, phone, 'Oi, quero melhorar minha oratória')
    const res = await inbound(env, phone, 'Achei muito caro, não cabe no meu orçamento')
    const ctx = systemContext(env.seed.tenantId)
    const suggestion = await suggestLostReason(env.db, ctx, res.leadId!)
    expect(suggestion).toBeTruthy()
    expect(['price_high', 'price']).toContain(suggestion!.key)
    expect(suggestion!.confidence).toBeGreaterThan(0.5)

    const leads = new LeadService(env.db)
    await leads.moveStage(
      ctx,
      res.leadId!,
      { stageKey: 'lost' },
      { lostReasonId: suggestion!.reasonId, suggestedByAi: true },
    )
    const lead = await env.db.lead.findUnique({ where: { id: res.leadId! } })
    expect(lead).toMatchObject({
      status: 'lost',
      lostReasonId: suggestion!.reasonId,
      lostReasonSuggestedByAi: true,
      lostReasonConfirmed: false,
    })
  })

  it('suggests "no_response" for a silent lead and marks a human-chosen reason as confirmed', async () => {
    const phone = randomPhone()
    const res = await inbound(env, phone, 'Oi, vi o anúncio de vocês')
    const ctx = systemContext(env.seed.tenantId)
    expect(await suggestLostReason(env.db, ctx, res.leadId!)).toBeNull()
    const later = new Date(Date.now() + 8 * 864e5)
    const silent = await suggestLostReason(env.db, ctx, res.leadId!, later)
    expect(silent?.key).toBe('no_response')

    const other = await env.db.lostReason.findFirst({
      where: { tenantId: env.seed.tenantId, key: 'competitor' },
    })
    await new LeadService(env.db).moveStage(
      ctx,
      res.leadId!,
      { stageKey: 'lost' },
      { lostReasonId: other!.id },
    )
    const lead = await env.db.lead.findUnique({ where: { id: res.leadId! } })
    expect(lead).toMatchObject({
      lostReasonId: other!.id,
      lostReasonSuggestedByAi: false,
      lostReasonConfirmed: true,
    })
  })
})
