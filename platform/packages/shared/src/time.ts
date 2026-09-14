import { DateTime, Interval } from 'luxon'

export const DEFAULT_TIMEZONE = 'America/Cuiaba'

export function nowUtc(): Date {
  return new Date()
}

export function toZoned(date: Date, timezone: string): DateTime {
  return DateTime.fromJSDate(date, { zone: 'utc' }).setZone(timezone)
}

export function formatInZone(
  date: Date,
  timezone: string,
  format = "dd/MM/yyyy 'às' HH:mm",
): string {
  return toZoned(date, timezone).setLocale('pt-BR').toFormat(format)
}

export function hoursBetween(a: Date, b: Date): number {
  return Math.abs(b.getTime() - a.getTime()) / 36e5
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 36e5)
}

export function addDays(date: Date, days: number): Date {
  return addHours(date, days * 24)
}

export interface BusinessHoursRule {
  /** 1 = Monday … 7 = Sunday (ISO) */
  weekday: number
  start: string // HH:mm
  end: string // HH:mm
}

export function isWithinRules(date: Date, timezone: string, rules: BusinessHoursRule[]): boolean {
  if (!rules.length) return true
  const zoned = toZoned(date, timezone)
  const minutes = zoned.hour * 60 + zoned.minute
  return rules.some((r) => {
    if (r.weekday !== zoned.weekday) return false
    return minutes >= toMinutes(r.start) && minutes < toMinutes(r.end)
  })
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => Number.parseInt(n, 10))
  return (h ?? 0) * 60 + (m ?? 0)
}

/** Whether `date` falls in a quiet-hours window (which may cross midnight). */
export function isQuietHours(date: Date, timezone: string, start: string, end: string): boolean {
  const zoned = toZoned(date, timezone)
  const minutes = zoned.hour * 60 + zoned.minute
  const s = toMinutes(start)
  const e = toMinutes(end)
  if (s === e) return false
  if (s < e) return minutes >= s && minutes < e
  return minutes >= s || minutes < e
}

/** Move `date` forward to the next moment outside quiet hours. */
export function nextAllowedTime(date: Date, timezone: string, start: string, end: string): Date {
  if (!isQuietHours(date, timezone, start, end)) return date
  const zoned = toZoned(date, timezone)
  const e = toMinutes(end)
  let candidate = zoned.set({ hour: Math.floor(e / 60), minute: e % 60, second: 0, millisecond: 0 })
  if (candidate <= zoned) candidate = candidate.plus({ days: 1 })
  return candidate.toUTC().toJSDate()
}

export function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  const a = Interval.fromDateTimes(DateTime.fromJSDate(aStart), DateTime.fromJSDate(aEnd))
  const b = Interval.fromDateTimes(DateTime.fromJSDate(bStart), DateTime.fromJSDate(bEnd))
  return a.overlaps(b)
}

export { DateTime }
