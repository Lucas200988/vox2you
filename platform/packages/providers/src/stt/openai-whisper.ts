import OpenAI, { toFile } from 'openai'
import type { SpeechToTextProvider, TranscriptionRequest, TranscriptionResult } from '@vox/core'
import { ProviderError } from '@vox/core'

export class OpenAIWhisperProvider implements SpeechToTextProvider {
  readonly name = 'openai-whisper'
  private readonly client: OpenAI

  constructor(
    private readonly model = 'gpt-4o-mini-transcribe',
    opts: { apiKey?: string } = {},
  ) {
    this.client = new OpenAI({ apiKey: opts.apiKey, maxRetries: 2 })
  }

  async transcribe(req: TranscriptionRequest): Promise<TranscriptionResult> {
    try {
      const ext = req.mimeType.includes('ogg') ? 'ogg' : req.mimeType.includes('mp4') || req.mimeType.includes('m4a') ? 'm4a' : req.mimeType.includes('mpeg') ? 'mp3' : 'webm'
      const file = await toFile(req.buffer, req.fileName ?? `audio.${ext}`, { type: req.mimeType.split(';')[0] })
      const res = await this.client.audio.transcriptions.create({ file, model: this.model, language: req.languageHint?.slice(0, 2) ?? 'pt', response_format: 'json' })
      return { text: res.text.trim(), language: req.languageHint ?? 'pt', provider: this.name }
    } catch (err) {
      if (err instanceof OpenAI.APIError) throw new ProviderError('openai-stt', `${err.status} ${err.message}`)
      throw err
    }
  }
}
