import { estimateTokens, normalizeWhitespace } from '@vox/shared'

export interface Chunk {
  ordinal: number
  content: string
  tokenCount: number
  metadata: { heading?: string; section?: number }
}

export interface ChunkOptions {
  targetTokens?: number
  maxTokens?: number
  overlapTokens?: number
}

/**
 * Heading/paragraph-aware chunker. Splits on markdown headings and blank lines, packs paragraphs
 * up to `targetTokens`, hard-splits oversized paragraphs by sentences, and carries an overlap tail.
 */
export function chunkText(raw: string, opts: ChunkOptions = {}): Chunk[] {
  const target = opts.targetTokens ?? 350
  const max = opts.maxTokens ?? 480
  const overlap = opts.overlapTokens ?? 40
  const text = normalizeWhitespace(raw)
  if (!text) return []

  const blocks: Array<{ heading?: string; text: string }> = []
  let heading: string | undefined
  for (const para of text.split(/\n{2,}/)) {
    const p = para.trim()
    if (!p) continue
    const h = p.match(/^(#{1,6})\s+(.+)$/m)
    if (h && p.split('\n').length === 1) {
      heading = h[2]!.trim()
      continue
    }
    for (const piece of splitOversized(p, max)) blocks.push({ heading, text: piece })
  }

  const chunks: Chunk[] = []
  let buffer: string[] = []
  let bufferTokens = 0
  let bufferHeading: string | undefined
  const flush = () => {
    if (!buffer.length) return
    const content = (bufferHeading ? `${bufferHeading}\n` : '') + buffer.join('\n\n')
    chunks.push({ ordinal: chunks.length, content, tokenCount: estimateTokens(content), metadata: { heading: bufferHeading, section: chunks.length } })
    // overlap: keep the tail of the last paragraph
    const last = buffer[buffer.length - 1] ?? ''
    const tail = takeTailTokens(last, overlap)
    buffer = tail ? [tail] : []
    bufferTokens = tail ? estimateTokens(tail) : 0
  }

  for (const block of blocks) {
    const t = estimateTokens(block.text)
    if (bufferHeading !== block.heading && buffer.length) {
      flush()
      buffer = []
      bufferTokens = 0
    }
    bufferHeading = block.heading
    if (bufferTokens + t > target && buffer.length) flush()
    buffer.push(block.text)
    bufferTokens += t
  }
  if (buffer.length) {
    const content = (bufferHeading ? `${bufferHeading}\n` : '') + buffer.join('\n\n')
    chunks.push({ ordinal: chunks.length, content, tokenCount: estimateTokens(content), metadata: { heading: bufferHeading, section: chunks.length } })
  }
  return chunks.filter((c) => c.content.trim().length > 20)
}

function splitOversized(paragraph: string, maxTokens: number): string[] {
  if (estimateTokens(paragraph) <= maxTokens) return [paragraph]
  const sentences = paragraph.split(/(?<=[.!?])\s+/)
  const out: string[] = []
  let cur = ''
  for (const s of sentences) {
    if (estimateTokens(cur + ' ' + s) > maxTokens && cur) {
      out.push(cur.trim())
      cur = s
    } else {
      cur = cur ? `${cur} ${s}` : s
    }
  }
  if (cur) out.push(cur.trim())
  return out.flatMap((o) => (estimateTokens(o) > maxTokens ? hardSplit(o, maxTokens) : [o]))
}

function hardSplit(text: string, maxTokens: number): string[] {
  const size = Math.floor(maxTokens * 3.5)
  const out: string[] = []
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size))
  return out
}

function takeTailTokens(text: string, tokens: number): string {
  if (tokens <= 0) return ''
  const chars = Math.floor(tokens * 3.5)
  if (text.length <= chars) return text
  const tail = text.slice(-chars)
  const idx = tail.indexOf(' ')
  return idx > 0 ? tail.slice(idx + 1) : tail
}
