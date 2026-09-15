import type { Classification } from '@vox/shared'

export interface ScoringFactor {
  key: string
  weight: number
  value: string | number | boolean
  points: number
  explanation: string
}

export interface ScoringInput {
  facts: Array<{ key: string; value: string; source: string }>
  classification?: Classification | null
  inboundMessages: number
  outboundMessages: number
  lastInboundAt: Date | null
  askedPrice: boolean
  askedSchedule: boolean
  requestedBooking: boolean
  requestedEnrollment: boolean
  isB2B: boolean
  productMatched: boolean
  appointmentsCount: number
  optedOut: boolean
  now?: Date
}

/** Default weights (editable per unit through ScoringConfig.weights). Points are weight × signal (0..1). */
export const DEFAULT_SCORING_WEIGHTS: Record<string, number> = {
  pain_identified: 12,
  goal_identified: 8,
  urgency_high: 12,
  urgency_medium: 6,
  buying_signal: 20,
  asked_price: 10,
  asked_schedule: 10,
  requested_booking: 15,
  requested_enrollment: 25,
  b2b_inquiry: 10,
  decision_maker: 8,
  product_match: 8,
  engagement: 10,
  recency: 8,
  appointment: 15,
  price_objection: -6,
  time_objection: -4,
  later: -8,
  negative_sentiment: -5,
  opted_out: -100,
}

export interface ScoringResult {
  score: number
  factors: ScoringFactor[]
  topReasons: string[]
}

export function computeLeadScore(input: ScoringInput, weights: Record<string, number> = DEFAULT_SCORING_WEIGHTS): ScoringResult {
  const w = { ...DEFAULT_SCORING_WEIGHTS, ...weights }
  const factors: ScoringFactor[] = []
  const add = (key: string, signal: number, value: ScoringFactor['value'], explanation: string) => {
    const weight = w[key] ?? 0
    if (signal <= 0 || weight === 0) return
    factors.push({ key, weight, value, points: Math.round(weight * Math.min(1, signal)), explanation })
  }
  const has = (k: string) => input.facts.some((f) => f.key === k)
  const factVal = (k: string) => input.facts.find((f) => f.key === k)?.value?.toLowerCase() ?? ''

  if (has('pain')) add('pain_identified', 1, factVal('pain'), 'Dor principal identificada')
  if (has('goal')) add('goal_identified', 1, factVal('goal'), 'Objetivo identificado')
  const urgency = factVal('urgency') || input.classification?.urgency
  if (urgency === 'high') add('urgency_high', 1, 'high', 'Urgência alta declarada')
  else if (urgency === 'medium') add('urgency_medium', 1, 'medium', 'Urgência média')
  if (input.classification?.intent === 'buying_signal') add('buying_signal', 1, true, 'Demonstrou intenção de compra')
  if (input.askedPrice) add('asked_price', 1, true, 'Perguntou sobre preço')
  if (input.askedSchedule) add('asked_schedule', 1, true, 'Perguntou sobre horários/turmas')
  if (input.requestedBooking) add('requested_booking', 1, true, 'Pediu visita/aula experimental')
  if (input.requestedEnrollment) add('requested_enrollment', 1, true, 'Pediu matrícula')
  if (input.isB2B) add('b2b_inquiry', 1, true, 'Interesse corporativo (B2B)')
  const dm = factVal('decision_maker')
  if (dm && !/(esposa|marido|s[oó]cio|chefe|gestor|pai|m[aã]e)/.test(dm)) add('decision_maker', 1, dm, 'É o decisor')
  if (input.productMatched) add('product_match', 1, true, 'Produto adequado identificado')
  const engagement = Math.min(1, input.inboundMessages / 8)
  add('engagement', engagement, input.inboundMessages, `${input.inboundMessages} mensagens enviadas pelo lead`)
  if (input.lastInboundAt) {
    const hours = ((input.now ?? new Date()).getTime() - input.lastInboundAt.getTime()) / 36e5
    const recency = hours < 24 ? 1 : hours < 72 ? 0.6 : hours < 168 ? 0.3 : 0
    add('recency', recency, Math.round(hours), hours < 24 ? 'Interagiu nas últimas 24h' : `Última interação há ${Math.round(hours / 24)} dias`)
  }
  if (input.appointmentsCount > 0) add('appointment', 1, input.appointmentsCount, 'Possui agendamento')

  const objections = input.facts.filter((f) => f.key === 'objection').map((f) => f.value.toLowerCase())
  if (objections.some((o) => /pre[cç]o|caro|valor|dinheiro/.test(o))) add('price_objection', 1, 'price', 'Objeção de preço')
  if (objections.some((o) => /tempo|agenda|hor[aá]rio/.test(o))) add('time_objection', 1, 'time', 'Objeção de tempo')
  if (objections.some((o) => /depois|pensar|mais tarde|m[eê]s que vem/.test(o))) add('later', 1, 'later', 'Adiou a decisão')
  if (input.classification?.sentiment === 'negative' || input.classification?.sentiment === 'frustrated') add('negative_sentiment', 1, input.classification.sentiment, 'Sentimento negativo')
  if (input.optedOut) add('opted_out', 1, true, 'Pediu para não ser contatado')

  const raw = factors.reduce((s, f) => s + f.points, 0)
  const score = Math.max(0, Math.min(100, raw))
  const topReasons = [...factors].sort((a, b) => Math.abs(b.points) - Math.abs(a.points)).slice(0, 5).map((f) => `${f.points > 0 ? '+' : ''}${f.points} ${f.explanation}`)
  return { score, factors, topReasons }
}
