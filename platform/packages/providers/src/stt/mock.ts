import type { SpeechToTextProvider, TranscriptionRequest, TranscriptionResult } from '@vox/core'

/** Returns the buffer content as text when it is a "mock-media:<text>" marker, else a fixed transcript. */
export class MockSttProvider implements SpeechToTextProvider {
  readonly name = 'mock'
  constructor(private readonly fixed = 'Oi, queria saber como funciona o curso de oratória.') {}

  async transcribe(req: TranscriptionRequest): Promise<TranscriptionResult> {
    const raw = req.buffer.toString('utf8')
    const text = raw.startsWith('mock-media:') ? raw.slice('mock-media:'.length) : this.fixed
    return { text: text.startsWith('media-') ? this.fixed : text, language: 'pt-BR', confidence: 0.95, durationSec: 4, provider: this.name }
  }
}
