import { DateTime } from 'luxon'
import type { AvailableSlot, CalendarEvent, CalendarEventInput, CalendarProvider, CalendarRef } from '@vox/core'
import { newId, toMinutes } from '@vox/shared'

/** Rule-based internal calendar: availability rules per weekday minus existing appointments. */
export class InternalCalendarProvider implements CalendarProvider {
  readonly name = 'internal'
  private readonly events = new Map<string, CalendarEvent>()

  async getAvailableSlots(params: { calendar: CalendarRef; from: Date; to: Date; durationMin?: number; busy?: AvailableSlot[] }): Promise<AvailableSlot[]> {
    const { calendar } = params
    const duration = params.durationMin ?? calendar.slotDurationMin
    const step = duration + calendar.bufferMin
    const rules = calendar.availabilityRules.length ? calendar.availabilityRules : [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '09:00', end: '18:00' }))
    const busy = params.busy ?? []
    const slots: AvailableSlot[] = []
    const minStart = Math.max(params.from.getTime(), Date.now() + 60 * 60000) // at least 1h from now
    let day = DateTime.fromJSDate(params.from, { zone: calendar.timezone }).startOf('day')
    const end = DateTime.fromJSDate(params.to, { zone: calendar.timezone })
    while (day <= end) {
      for (const rule of rules.filter((r) => r.weekday === day.weekday)) {
        let cursor = day.plus({ minutes: toMinutes(rule.start) })
        const ruleEnd = day.plus({ minutes: toMinutes(rule.end) })
        while (cursor.plus({ minutes: duration }) <= ruleEnd) {
          const start = cursor.toUTC().toJSDate()
          const finish = cursor.plus({ minutes: duration }).toUTC().toJSDate()
          const overlaps = busy.some((b) => b.start < finish && b.end > start)
          if (start.getTime() >= minStart && finish <= params.to && !overlaps) slots.push({ start, end: finish })
          cursor = cursor.plus({ minutes: step })
        }
      }
      day = day.plus({ days: 1 })
    }
    return slots
  }

  async createEvent(input: CalendarEventInput): Promise<CalendarEvent> {
    const ev: CalendarEvent = { externalId: `internal-${newId()}`, start: input.start, end: input.end, title: input.title, status: 'confirmed' }
    this.events.set(ev.externalId, ev)
    return ev
  }

  async rescheduleEvent(_calendar: CalendarRef, externalId: string, start: Date, end: Date): Promise<CalendarEvent> {
    const ev = this.events.get(externalId) ?? { externalId, start, end, title: 'Compromisso', status: 'confirmed' }
    const updated = { ...ev, start, end }
    this.events.set(externalId, updated)
    return updated
  }

  async cancelEvent(_calendar: CalendarRef, externalId: string): Promise<void> {
    const ev = this.events.get(externalId)
    if (ev) this.events.set(externalId, { ...ev, status: 'cancelled' })
  }

  async getEvent(_calendar: CalendarRef, externalId: string): Promise<CalendarEvent | null> {
    return this.events.get(externalId) ?? null
  }
}
