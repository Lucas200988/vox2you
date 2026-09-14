export function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

export function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function slugify(text: string): string {
  return stripAccents(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

export function countQuestions(text: string): number {
  return (text.match(/\?/g) ?? []).length
}

/** Rough token estimate for pt-BR text (≈ 3.5 chars per token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5)
}

const MONEY_RE = /(?:R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\b\d{1,3}(?:\.\d{3})*(?:,\d{2})?\s?(?:reais|real)\b)/gi

/** Extracts monetary amounts mentioned in text as canonical "R$ 1.234,56" strings. */
export function extractMoneyMentions(text: string): string[] {
  const matches = text.match(MONEY_RE) ?? []
  return matches.map((m) => m.replace(/\s+/g, ' ').trim())
}

export function parseBrlAmount(mention: string): number | null {
  const numeric = mention.replace(/[^\d,.]/g, '')
  if (!numeric) return null
  const normalized = numeric.replace(/\./g, '').replace(',', '.')
  const value = Number.parseFloat(normalized)
  return Number.isFinite(value) ? value : null
}

export function formatBrl(value: number | string): string {
  const n = typeof value === 'string' ? Number.parseFloat(value) : value
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const TIME_RE = /\b([01]?\d|2[0-3])[:h]([0-5]\d)?\b/g

/** Extracts clock times like "19h", "19:30", "8h30" from text. */
export function extractTimeMentions(text: string): string[] {
  return [...text.matchAll(TIME_RE)].map((m) => `${m[1]!.padStart(2, '0')}:${m[2] ?? '00'}`)
}

/** Tags used to wrap untrusted content inside prompts. */
export function wrapUntrusted(tag: string, content: string): string {
  const safe = content.replace(new RegExp(`</?${tag}>`, 'gi'), '')
  return `<${tag}>\n${safe}\n</${tag}>`
}

export function firstName(fullName: string | null | undefined): string | null {
  if (!fullName) return null
  const [first] = fullName.trim().split(/\s+/)
  return first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : null
}

export function safeJsonParse<T = unknown>(raw: string): T | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  try {
    return JSON.parse(cleaned) as T
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T
      } catch {
        return null
      }
    }
    return null
  }
}
