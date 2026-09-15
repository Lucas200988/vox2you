import { describe, expect, it } from 'vitest'
import { computeLeadScore } from './lead-scoring.js'

const base = { facts: [], classification: null, inboundMessages: 1, outboundMessages: 1, lastInboundAt: new Date(), askedPrice: false, askedSchedule: false, requestedBooking: false, requestedEnrollment: false, isB2B: false, productMatched: false, appointmentsCount: 0, optedOut: false }

describe('computeLeadScore', () => {
  it('explains every point with factors', () => {
    const r = computeLeadScore({ ...base, facts: [{ key: 'pain', value: 'vergonha', source: 'stated' }], askedPrice: true, requestedBooking: true })
    expect(r.score).toBe(r.factors.reduce((s, f) => s + f.points, 0))
    expect(r.factors.map((f) => f.key)).toEqual(expect.arrayContaining(['pain_identified', 'asked_price', 'requested_booking', 'engagement', 'recency']))
    expect(r.topReasons.length).toBeGreaterThan(0)
  })
  it('penalizes objections and opt-out, clamps to 0..100', () => {
    const cold = computeLeadScore({ ...base, facts: [{ key: 'objection', value: 'achei caro', source: 'stated' }], optedOut: true })
    expect(cold.score).toBe(0)
    const hot = computeLeadScore({ ...base, facts: [{ key: 'pain', value: 'x', source: 'stated' }, { key: 'goal', value: 'y', source: 'stated' }, { key: 'urgency', value: 'high', source: 'stated' }], askedPrice: true, askedSchedule: true, requestedBooking: true, requestedEnrollment: true, isB2B: true, productMatched: true, appointmentsCount: 1, inboundMessages: 20 })
    expect(hot.score).toBe(100)
  })
  it('respects custom weights', () => {
    const r = computeLeadScore({ ...base, askedPrice: true }, { asked_price: 50, engagement: 0, recency: 0 })
    expect(r.score).toBe(50)
  })
})
