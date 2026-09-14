import { createHash } from 'node:crypto'
import type { EmbeddingProvider } from '@vox/core'
import { stripAccents } from '@vox/shared'

/**
 * Deterministic bag-of-words hashing embedding (no network). Semantically weak but stable, so
 * hybrid search, indexing and tests work offline. Swap for OpenAIEmbeddingProvider in production.
 */
export class HashEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'hash'
  readonly model = 'hash-bow-v1'

  constructor(readonly dimensions = 1536) {}

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.embedOne(t))
  }

  private embedOne(text: string): number[] {
    const vec = new Array<number>(this.dimensions).fill(0)
    const tokens = stripAccents(text.toLowerCase()).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2)
    const grams = [...tokens, ...tokens.slice(1).map((w, i) => `${tokens[i]}_${w}`)]
    for (const g of grams) {
      const h = createHash('md5').update(g).digest()
      const idx = h.readUInt32BE(0) % this.dimensions
      const sign = h[4]! % 2 === 0 ? 1 : -1
      vec[idx] = (vec[idx] ?? 0) + sign
    }
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1
    return vec.map((v) => v / norm)
  }
}
