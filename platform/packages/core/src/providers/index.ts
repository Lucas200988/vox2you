import type { CalendarProvider } from './calendar.js'
import type { ConversionProvider } from './conversion.js'
import type { EmailProvider } from './email.js'
import type { EmbeddingProvider } from './embedding.js'
import type { LLMProvider, ModelRouting } from './llm.js'
import type { MessagingProvider } from './messaging.js'
import type { DocumentParser, UrlFetcher } from './parser.js'
import type { PaymentProvider } from './payment.js'
import type { SpeechToTextProvider } from './stt.js'
import type { StorageProvider } from './storage.js'
import type { TraceSink } from './trace.js'

export * from './llm.js'
export * from './embedding.js'
export * from './messaging.js'
export * from './stt.js'
export * from './calendar.js'
export * from './storage.js'
export * from './trace.js'
export * from './email.js'
export * from './payment.js'
export * from './conversion.js'
export * from './parser.js'

/** Dependency container handed to services. Built by apps from env (see @vox/providers factory). */
export interface Providers {
  llm: LLMProvider
  models: ModelRouting
  embedding: EmbeddingProvider
  messaging: MessagingProvider
  /** Resolve messaging provider per channel (multi-number / multi-BSP). Defaults to `messaging`. */
  messagingFor?: (channel: { provider: string; externalId: string; config: unknown }) => MessagingProvider
  stt: SpeechToTextProvider
  calendar: CalendarProvider
  storage: StorageProvider
  trace: TraceSink
  email?: EmailProvider
  payment?: PaymentProvider
  conversion?: ConversionProvider
  parsers: DocumentParser[]
  urlFetcher?: UrlFetcher
}
