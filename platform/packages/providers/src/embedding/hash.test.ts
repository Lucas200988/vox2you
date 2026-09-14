import { describe, expect, it } from 'vitest'
import { HashEmbeddingProvider } from './hash.js'

describe('HashEmbeddingProvider', () => {
  it('is deterministic, normalized and similar for overlapping text', async () => {
    const p = new HashEmbeddingProvider(256)
    const [a, b, c] = await p.embed(['preço do curso master', 'qual o preço do master', 'horário das turmas de sábado'])
    expect(a).toEqual((await p.embed(['preço do curso master']))[0])
    const norm = Math.sqrt(a!.reduce((s, v) => s + v * v, 0))
    expect(norm).toBeCloseTo(1, 5)
    const dot = (x: number[], y: number[]) => x.reduce((s, v, i) => s + v * y[i]!, 0)
    expect(dot(a!, b!)).toBeGreaterThan(dot(a!, c!))
  })
})
