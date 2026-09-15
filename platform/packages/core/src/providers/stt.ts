export interface TranscriptionRequest {
  buffer: Buffer
  mimeType: string
  languageHint?: string
  fileName?: string
}

export interface TranscriptionResult {
  text: string
  language?: string
  confidence?: number
  durationSec?: number
  provider: string
}

export interface SpeechToTextProvider {
  readonly name: string
  transcribe(request: TranscriptionRequest): Promise<TranscriptionResult>
}
