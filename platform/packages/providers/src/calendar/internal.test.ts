import { describe, expect, it } from 'vitest'
import { InternalCalendarProvider } from './internal.js'

describe('InternalCalendarProvider', () => {
  it('generates slots from rules minus busy periods', async () => {
    const p = new InternalCalendarProvider()
    const from = new Date(Date.now() + 2 * 3600e3)
    const to = new Date(from.getTime() + 7 * 864e5)
    const calendar = { id: 'c', timezone: 'America/Cuiaba', availabilityRules: [{ weekday: 1, start: '09:00', end: '12:00' }, { weekday: 2, start: '14:00', end: '16:00' }], slotDurationMin: 60, bufferMin: 0 }
    const slots = await p.getAvailableSlots({ calendar, from, to })
    expect(slots.length).toBeGreaterThan(0)
    for (const s of slots) {
      expect(s.end.getTime() - s.start.getTime()).toBe(3600e3)
      expect(s.start.getTime()).toBeGreaterThanOrEqual(from.getTime())
    }
    const busy = [{ start: slots[0]!.start, end: slots[0]!.end }]
    const after = await p.getAvailableSlots({ calendar, from, to, busy })
    expect(after.find((s) => s.start.getTime() === slots[0]!.start.getTime())).toBeUndefined()
  })
})
