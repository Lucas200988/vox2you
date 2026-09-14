import OpenAI from 'openai'
import type { EmbeddingProvider } from '@vox/core'
import { ProviderError } from '@vox/core'

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai'
  private readonly client: OpenAI

  constructor(
    readonly model = 'text-embedding-3-small',
    readonly dimensions = 1536,
    opts: { apiKey?: string } = {},
  ) {
    this.client = new OpenAI({ apiKey: opts.apiKey, maxRetries: 3 })
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!texts.length) return []
    try {
      const res = await this.client.embeddings.create({ model: this.model, input: texts.map((t) => t.slice(0, 8000)), dimensions: this.dimensions })
      return res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding)
    } catch (err) {
      if (err instanceof OpenAI.APIError) throw new ProviderError('openai-embeddings', `${err.status} ${err.message}`)
      throw err
    }
  }
}
