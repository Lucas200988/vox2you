import { google, type calendar_v3 } from 'googleapis'
import type { AvailableSlot, CalendarEvent, CalendarEventInput, CalendarProvider, CalendarRef } from '@vox/core'
import { ProviderError } from '@vox/core'
import { InternalCalendarProvider } from './internal.js'

export interface GoogleCalendarConfig {
  /** Service account JSON (object or base64 string). The calendar must be shared with the service account e-mail. */
  serviceAccount: string | Record<string, unknown>
  /** Default Google calendar id when CalendarRef.externalId is empty */
  defaultCalendarId?: string
}

/**
 * Google Calendar adapter: availability = unit rules (internal) minus Google free/busy; events are
 * created on the Google calendar. PENDING credential: GOOGLE_SERVICE_ACCOUNT_JSON.
 */
export class GoogleCalendarProvider implements CalendarProvider {
  readonly name = 'google'
  private readonly api: calendar_v3.Calendar
  private readonly rules = new InternalCalendarProvider()

  constructor(private readonly cfg: GoogleCalendarConfig) {
    const creds = typeof cfg.serviceAccount === 'string' ? (JSON.parse(Buffer.from(cfg.serviceAccount, 'base64').toString('utf8')) as { client_email: string; private_key: string }) : (cfg.serviceAccount as { client_email: string; private_key: string })
    const auth = new google.auth.JWT({ email: creds.client_email, key: creds.private_key, scopes: ['https://www.googleapis.com/auth/calendar'] })
    this.api = google.calendar({ version: 'v3', auth })
  }

  private calId(calendar: CalendarRef): string {
    const id = calendar.externalId ?? this.cfg.defaultCalendarId
    if (!id) throw new ProviderError('google-calendar', 'calendar externalId not configured')
    return id
  }

  async getAvailableSlots(params: { calendar: CalendarRef; from: Date; to: Date; durationMin?: number; busy?: AvailableSlot[] }): Promise<AvailableSlot[]> {
    const calendarId = this.calId(params.calendar)
    let googleBusy: AvailableSlot[] = []
    try {
      const fb = await this.api.freebusy.query({ requestBody: { timeMin: params.from.toISOString(), timeMax: params.to.toISOString(), timeZone: params.calendar.timezone, items: [{ id: calendarId }] } })
      googleBusy = (fb.data.calendars?.[calendarId]?.busy ?? []).map((b) => ({ start: new Date(b.start!), end: new Date(b.end!) }))
    } catch (err) {
      throw new ProviderError('google-calendar', (err as Error).message)
    }
    return this.rules.getAvailableSlots({ ...params, busy: [...(params.busy ?? []), ...googleBusy] })
  }

  async createEvent(input: CalendarEventInput): Promise<CalendarEvent> {
    const res = await this.api.events.insert({
      calendarId: this.calId(input.calendar),
      requestBody: {
        summary: input.title,
        description: [input.description, input.attendeeName ? `Contato: ${input.attendeeName}` : null, input.attendeePhone ? `Telefone: ${input.attendeePhone}` : null].filter(Boolean).join('\n'),
        start: { dateTime: input.start.toISOString(), timeZone: input.calendar.timezone },
        end: { dateTime: input.end.toISOString(), timeZone: input.calendar.timezone },
        location: input.location,
        ...(input.attendeeEmail ? { attendees: [{ email: input.attendeeEmail, displayName: input.attendeeName }] } : {}),
      },
    })
    return toEvent(res.data)
  }

  async rescheduleEvent(calendar: CalendarRef, externalId: string, start: Date, end: Date): Promise<CalendarEvent> {
    const res = await this.api.events.patch({ calendarId: this.calId(calendar), eventId: externalId, requestBody: { start: { dateTime: start.toISOString(), timeZone: calendar.timezone }, end: { dateTime: end.toISOString(), timeZone: calendar.timezone } } })
    return toEvent(res.data)
  }

  async cancelEvent(calendar: CalendarRef, externalId: string): Promise<void> {
    await this.api.events.delete({ calendarId: this.calId(calendar), eventId: externalId })
  }

  async getEvent(calendar: CalendarRef, externalId: string): Promise<CalendarEvent | null> {
    try {
      const res = await this.api.events.get({ calendarId: this.calId(calendar), eventId: externalId })
      return toEvent(res.data)
    } catch {
      return null
    }
  }
}

function toEvent(e: calendar_v3.Schema$Event): CalendarEvent {
  return { externalId: e.id ?? '', start: new Date(e.start?.dateTime ?? e.start?.date ?? 0), end: new Date(e.end?.dateTime ?? e.end?.date ?? 0), title: e.summary ?? '', status: e.status ?? 'confirmed', htmlLink: e.htmlLink ?? undefined }
}
