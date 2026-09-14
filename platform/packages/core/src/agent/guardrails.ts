import type { ValidationIssue, ValidationResult } from '@vox/shared'
import { countQuestions, extractMoneyMentions, extractTimeMentions, parseBrlAmount, stripAccents } from '@vox/shared'
import type { AgentCatalog } from '../catalog/product-service.js'
import type { SearchHit } from '../knowledge/search-service.js'
import type { AvailableSlot } from '../providers/calendar.js'
import type { MemorySnapshot } from './types.js'

export interface GuardrailInput {
  reply: string
  catalog: AgentCatalog | null
  knowledge: SearchHit[]
  slots: AvailableSlot[] | null
  memory: MemorySnapshot
  maxChars: number
  maxQuestions: number
  timezone: string
}

const FORBIDDEN_PATTERNS: Array<{ re: RegExp; code: string; message: string }> = [
  { re: /(garantimos|garantido|garantia de resultado|resultado garantido|100% de sucesso)/i, code: 'guaranteed_result', message: 'Promessa de resultado garantido' },
  { re: /(últimas? vagas?|ultimas? vagas?|só hoje|somente hoje|última chance|ultima chance|oferta acaba)/i, code: 'false_scarcity', message: 'Escassez sem fonte (só permitido se vier do catálogo)' },
  { re: /\b(ignore|desconsidere) (as|todas as) instruções/i, code: 'injection_echo', message: 'Eco de instrução injetada' },
]

/**
 * Deterministic validation executed on every generated reply before the (optional) LLM verifier.
 * Blocks unsupported prices/times, forbidden claims, and flags length/repetition/question-count issues.
 */
export function runGuardrails(input: GuardrailInput): ValidationResult {
  const issues: ValidationIssue[] = []
  let reply = input.reply.trim()

  // 1. Money mentions must be backed by catalog offers
  const allowedAmounts = new Set<number>()
  for (const p of input.catalog ?? []) {
    for (const o of p.offers) {
      allowedAmounts.add(o.listPrice)
      if (o.promoPrice !== null) allowedAmounts.add(o.promoPrice)
      if (o.installmentValue !== null) allowedAmounts.add(o.installmentValue)
    }
  }
  const knowledgeText = input.knowledge.map((k) => k.content).join('\n')
  const knowledgeAmounts = new Set(extractMoneyMentions(knowledgeText).map(parseBrlAmount).filter((n): n is number => n !== null))
  for (const mention of extractMoneyMentions(reply)) {
    const amount = parseBrlAmount(mention)
    if (amount === null) continue
    const inCatalog = [...allowedAmounts].some((a) => Math.abs(a - amount) < 0.01)
    const inKnowledge = [...knowledgeAmounts].some((a) => Math.abs(a - amount) < 0.01)
    if (!inCatalog && !inKnowledge) {
      issues.push({ code: 'unsupported_price', severity: 'block', message: `Valor "${mention}" não existe no catálogo vigente` })
    } else if (!inCatalog && inKnowledge) {
      issues.push({ code: 'price_from_knowledge', severity: 'warn', message: `Valor "${mention}" veio de documento, não do catálogo (catálogo prevalece)` })
    }
  }

  // 2. Discount percentages must be within offer limits
  const pct = [...reply.matchAll(/(\d{1,2})\s?%/g)].map((m) => Number(m[1]))
  if (pct.length) {
    const maxAllowed = Math.max(0, ...(input.catalog ?? []).flatMap((p) => p.offers.map((o) => o.maxDiscountPct)))
    if (/desconto|off|abatimento/i.test(reply) && pct.some((p) => p > maxAllowed)) issues.push({ code: 'unauthorized_discount', severity: 'block', message: `Desconto de ${Math.max(...pct)}% acima do permitido (${maxAllowed}%)` })
  }

  // 3. Clock times must be backed by class schedules, slots or knowledge
  const allowedTimes = new Set<string>()
  for (const p of input.catalog ?? []) for (const c of p.classes) allowedTimes.add(c.startTime).add(c.endTime)
  for (const s of input.slots ?? []) allowedTimes.add(localHHmm(s.start, input.timezone))
  for (const t of extractTimeMentions(knowledgeText)) allowedTimes.add(t)
  for (const t of extractTimeMentions(input.memory.recent.map((m) => m.text).join('\n'))) allowedTimes.add(t) // customer-mentioned times may be echoed
  for (const t of extractTimeMentions(reply)) {
    if (!allowedTimes.has(t)) issues.push({ code: 'unsupported_time', severity: 'block', message: `Horário ${t} não consta em turmas, agenda ou documentos` })
  }

  // 4. Forbidden claims
  for (const f of FORBIDDEN_PATTERNS) {
    if (f.re.test(reply)) {
      const fromKnowledge = f.code === 'false_scarcity' && /vagas?/i.test(knowledgeText)
      issues.push({ code: f.code, severity: fromKnowledge ? 'warn' : 'block', message: f.message })
    }
  }

  // 5. Length
  if (reply.length > input.maxChars) {
    issues.push({ code: 'too_long', severity: 'warn', message: `Resposta com ${reply.length} caracteres (máx ${input.maxChars})` })
  }

  // 6. Question count
  const q = countQuestions(reply)
  if (q > input.maxQuestions) issues.push({ code: 'too_many_questions', severity: q > input.maxQuestions + 1 ? 'warn' : 'info', message: `${q} perguntas na mesma mensagem` })

  // 7. Repeated question (already answered by facts or asked recently by the agent)
  const questions = reply.split(/(?<=\?)/).filter((s) => s.includes('?')).map((s) => normalize(s))
  const previousAgentQuestions = input.memory.recent.filter((m) => m.direction === 'outbound').flatMap((m) => m.text.split(/(?<=\?)/).filter((s) => s.includes('?')).map(normalize))
  for (const qn of questions) {
    if (previousAgentQuestions.some((p) => similarity(p, qn) > 0.8)) issues.push({ code: 'repeated_question', severity: 'warn', message: 'Pergunta já feita anteriormente' })
    if (asksKnownFact(qn, input.memory)) issues.push({ code: 'asks_known_fact', severity: 'warn', message: 'Pergunta cuja resposta já está nos fatos do lead' })
  }

  // 8. Robotic opener
  if (/^(olá|oi)[!,.]?\s+(como posso (te )?ajud)/i.test(reply)) issues.push({ code: 'robotic_opener', severity: 'info', message: 'Abertura genérica' })

  // Auto-fix for soft issues: trim length (cut at sentence boundary)
  if (issues.some((i) => i.code === 'too_long') && !issues.some((i) => i.severity === 'block')) {
    reply = cutAtSentence(reply, input.maxChars)
  }

  const ok = !issues.some((i) => i.severity === 'block')
  return { ok, issues, rewrittenReply: reply !== input.reply.trim() ? reply : undefined }
}

function normalize(s: string): string {
  return stripAccents(s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function similarity(a: string, b: string): number {
  const ta = new Set(a.split(' ').filter((w) => w.length > 2))
  const tb = new Set(b.split(' ').filter((w) => w.length > 2))
  if (!ta.size || !tb.size) return 0
  let inter = 0
  for (const w of ta) if (tb.has(w)) inter++
  return inter / Math.min(ta.size, tb.size)
}

const FACT_QUESTION_HINTS: Array<{ key: string; re: RegExp }> = [
  { key: 'preferred_period', re: /(manh[aã]|tarde|noite|per[ií]odo|hor[aá]rio prefer)/ },
  { key: 'goal', re: /(qual (seu|o) objetivo|o que (voc[eê] )?busca|o que te trouxe)/ },
  { key: 'pain', re: /(maior dificuldade|o que mais te trava|qual (sua|a) dificuldade)/ },
  { key: 'profile_type', re: /(pessoal ou (para|pra) (sua )?empresa|para voc[eê] ou (para|pra) (o|seu) time)/ },
  { key: 'name', re: /(qual (o )?seu nome|como (posso te chamar|voc[eê] se chama))/ },
  { key: 'city', re: /(qual (sua )?cidade|de onde voc[eê] fala|onde voc[eê] mora)/ },
]

function asksKnownFact(question: string, memory: MemorySnapshot): boolean {
  const known = new Set(memory.facts.map((f) => f.key))
  if (memory.contact.name) known.add('name')
  if (memory.contact.city) known.add('city')
  if (memory.contact.profileType) known.add('profile_type')
  return FACT_QUESTION_HINTS.some((h) => known.has(h.key) && h.re.test(question))
}

function cutAtSentence(text: string, max: number): string {
  if (text.length <= max) return text
  const slice = text.slice(0, max)
  const idx = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('? '), slice.lastIndexOf('! '), slice.lastIndexOf('\n'))
  return (idx > max * 0.5 ? slice.slice(0, idx + 1) : slice).trim()
}

function localHHmm(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone }).format(date).replace('h', ':')
}
