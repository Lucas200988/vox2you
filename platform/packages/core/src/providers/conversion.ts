export type ConversionEventName = 'Lead' | 'QualifiedLead' | 'Schedule' | 'Visit' | 'Purchase'

export interface ConversionEventInput {
  eventName: ConversionEventName
  eventId: string
  eventTime: Date
  /** Already-hashed (sha256) identifiers where required by the destination */
  user: { phoneHash?: string; emailHash?: string; externalId?: string; fbclid?: string; ctwaClid?: string }
  value?: number
  currency?: string
  custom?: Record<string, unknown>
}

export interface ConversionProvider {
  readonly name: string
  track(event: ConversionEventInput): Promise<{ accepted: boolean; raw?: unknown }>
}
