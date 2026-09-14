import { Prisma } from './generated/client.js'

/** Serializes a float array into a pgvector literal ("[0.1,0.2,...]"). */
export function toVectorLiteral(values: number[]): string {
  return `[${values.map((v) => (Number.isFinite(v) ? v.toFixed(7) : '0')).join(',')}]`
}

/** Builds a `plainto_tsquery`-friendly string; keeps words, drops punctuation. */
export function toSearchQuery(text: string): string {
  return text
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 32)
    .join(' ')
}

export const sql = Prisma.sql
export const join = Prisma.join
export const raw = Prisma.raw
export const empty = Prisma.empty
