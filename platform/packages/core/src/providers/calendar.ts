export interface CalendarRef {
  id: string // internal Calendar.id
  externalId?: string | null
  timezone: string
  availabilityRules: Array<{ weekday: number; start: string; end: string }>
  slotDurationMin: number
  bufferMin: number
  credentials?: Record<string, unknown>
}

export interface AvailableSlot {
  start: Date
  end: Date
}

export interface CalendarEventInput {
  calendar: CalendarRef
  title: string
  description?: string
  start: Date
  end: Date
  attendeeName?: string
  attendeePhone?: string
  attendeeEmail?: string
  location?: string
}

export interface CalendarEvent {
  externalId: string
  start: Date
  end: Date
  title: string
  status: string
  htmlLink?: string
}

export interface CalendarProvider {
  readonly name: string
  getAvailableSlots(params: {
    calendar: CalendarRef
    from: Date
    to: Date
    durationMin?: number
    /** Existing internal appointments to subtract (provider may also consult its own busy times) */
    busy?: AvailableSlot[]
  }): Promise<AvailableSlot[]>
  createEvent(input: CalendarEventInput): Promise<CalendarEvent>
  rescheduleEvent(calendar: CalendarRef, externalId: string, start: Date, end: Date): Promise<CalendarEvent>
  cancelEvent(calendar: CalendarRef, externalId: string): Promise<void>
  getEvent(calendar: CalendarRef, externalId: string): Promise<CalendarEvent | null>
}
