import { describe, expect, it } from 'vitest'
import { isQuietHours, isWithinRules, nextAllowedTime } from './time.js'

const tz = 'America/Cuiaba' // UTC-4

describe('time utils', () => {
  it('detects quiet hours across midnight', () => {
    // 23:30 local = 03:30 UTC
    expect(isQuietHours(new Date('2026-09-15T03:30:00Z'), tz, '21:00', '08:00')).toBe(true)
    // 10:00 local = 14:00 UTC
    expect(isQuietHours(new Date('2026-09-14T14:00:00Z'), tz, '21:00', '08:00')).toBe(false)
  })
  it('moves to next allowed time', () => {
    const next = nextAllowedTime(new Date('2026-09-15T03:30:00Z'), tz, '21:00', '08:00')
    expect(next.toISOString()).toBe('2026-09-15T12:00:00.000Z') // 08:00 local
  })
  it('checks business hours rules', () => {
    // Monday 2026-09-14 10:00 local = 14:00 UTC
    expect(isWithinRules(new Date('2026-09-14T14:00:00Z'), tz, [{ weekday: 1, start: '08:00', end: '18:00' }])).toBe(true)
    expect(isWithinRules(new Date('2026-09-14T23:00:00Z'), tz, [{ weekday: 1, start: '08:00', end: '18:00' }])).toBe(false)
  })
})
