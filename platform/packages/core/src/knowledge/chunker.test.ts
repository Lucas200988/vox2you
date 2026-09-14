import { describe, expect, it } from 'vitest'
import { chunkText } from './chunker.js'

describe('chunkText', () => {
  it('splits by headings and keeps heading context in each chunk', () => {
    const text = `# Preços\n\n${'O curso tem parcelamento. '.repeat(40)}\n\n# Turmas\n\n${'As turmas são pequenas. '.repeat(40)}`
    const chunks = chunkText(text, { targetTokens: 120, maxTokens: 160, overlapTokens: 10 })
    expect(chunks.length).toBeGreaterThan(2)
    expect(chunks[0]!.content.startsWith('Preços')).toBe(true)
    expect(chunks.some((c) => c.content.startsWith('Turmas'))).toBe(true)
    expect(chunks.every((c) => c.tokenCount <= 200)).toBe(true)
    expect(chunks.map((c) => c.ordinal)).toEqual(chunks.map((_, i) => i))
  })
  it('returns nothing for empty input and hard-splits huge paragraphs', () => {
    expect(chunkText('   ')).toEqual([])
    const huge = 'palavra '.repeat(3000)
    const chunks = chunkText(huge, { targetTokens: 300, maxTokens: 400 })
    expect(chunks.length).toBeGreaterThan(3)
  })
})
