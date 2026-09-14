import { stripAccents } from './text.js'

/**
 * Deterministic opt-out detection. Semantic detection (e.g. "não quero mais receber isso")
 * is complemented by the intent classifier; this list catches explicit commands cheaply.
 */
export const DEFAULT_OPT_OUT_PHRASES = [
  'pare',
  'parar',
  'para de me mandar',
  'nao me mande mais',
  'nao me manda mais',
  'nao quero mais receber',
  'nao quero receber',
  'sair',
  'cancelar',
  'cancela',
  'descadastrar',
  'remover',
  'me tira da lista',
  'stop',
  'unsubscribe',
  'nao tenho interesse',
  'nao me procure',
  'nao me procurem',
  'nao entre em contato',
]

export function detectOptOut(text: string, phrases: string[] = DEFAULT_OPT_OUT_PHRASES): boolean {
  const normalized = stripAccents(text).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!normalized) return false
  // Very short messages must match exactly to avoid false positives ("para" inside sentences)
  const words = normalized.split(' ')
  if (words.length <= 2) {
    return phrases.some((p) => stripAccents(p).toLowerCase() === normalized)
  }
  return phrases
    .filter((p) => p.includes(' '))
    .some((p) => normalized.includes(stripAccents(p).toLowerCase()))
}

export const OPT_IN_PHRASES = ['quero receber', 'pode me mandar', 'pode mandar', 'aceito receber', 'sim, quero']

export function detectOptIn(text: string): boolean {
  const normalized = stripAccents(text).toLowerCase()
  return OPT_IN_PHRASES.some((p) => normalized.includes(p))
}
