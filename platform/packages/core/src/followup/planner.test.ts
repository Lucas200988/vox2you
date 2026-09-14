import { describe, expect, it } from 'vitest'
import type { Classification } from '@vox/shared'
import { planFollowUp } from './planner.js'

const c = (over: Partial<Classification> = {}): Classification => ({ intent: 'info_request', secondaryIntents: [], sentiment: 'neutral', urgency: 'low', signals: [], profileType: 'unknown', needsKnowledge: false, needsCatalog: false, needsCalendar: false, requestsHuman: false, isEmotional: false, mentionsProducts: [], confidence: 0.9, ...over })
const now = new Date('2026-09-14T15:00:00Z')
const base = { stageKey: 'conversing', facts: [], optedOut: false, lastInboundAt: now, hasScheduledAppointment: false, attemptsSoFar: 0, policy: { maxAttempts: 4, strategies: {} }, now }

describe('planFollowUp', () => {
  it('never follows up after opt-out, won/lost, appointment or max attempts', () => {
    expect(planFollowUp({ ...base, classification: c(), optedOut: true }).schedule).toBe(false)
    expect(planFollowUp({ ...base, classification: c(), stageKey: 'won' }).schedule).toBe(false)
    expect(planFollowUp({ ...base, classification: c(), hasScheduledAppointment: true }).schedule).toBe(false)
    const maxed = planFollowUp({ ...base, classification: c(), attemptsSoFar: 4 })
    expect(maxed.schedule).toBe(false)
    expect(maxed.strategy).toBe('task_for_human')
  })
  it('respects "me chama mês que vem"', () => {
    const p = planFollowUp({ ...base, classification: c({ intent: 'objection', signals: ['later'] }), facts: [{ key: 'do_not_contact_until', value: '2026-10-01' }] })
    expect(p.schedule).toBe(true)
    expect(p.scheduledAt?.toISOString().slice(0, 10)).toBe('2026-10-01')
    expect(p.scenario).toBe('asked_later')
  })
  it('picks scenario-specific timing and backs off per attempt', () => {
    const price = planFollowUp({ ...base, classification: c({ intent: 'price_request' }) })
    expect(price.scenario).toBe('price_then_silence')
    expect(price.scheduledAt!.getTime() - now.getTime()).toBe(22 * 36e5)
    const booking = planFollowUp({ ...base, classification: c({ intent: 'booking_request' }) })
    expect(booking.scenario).toBe('abandoned_scheduling')
    const second = planFollowUp({ ...base, classification: c({ intent: 'price_request' }), attemptsSoFar: 1 })
    expect(second.scheduledAt!.getTime()).toBeGreaterThan(price.scheduledAt!.getTime())
  })
  it('uses agent-requested delay when provided', () => {
    const p = planFollowUp({ ...base, classification: c(), agentRequested: { hours: 5, reason: 'x' } })
    expect(p.scheduledAt!.getTime() - now.getTime()).toBe(5 * 36e5)
  })
})
