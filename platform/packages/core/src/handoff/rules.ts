import type { Classification } from '@vox/shared'
import type { HandoffRules } from '../settings/agent-settings.js'

export interface HandoffDecision {
  handoff: boolean
  reason?: string
  code?: string
}

export interface HandoffInput {
  classification: Classification
  text: string
  confidence: number
  minConfidence: number
  consecutiveBlockedRuns: number
  leadScore: number
  rules: HandoffRules
  signals: string[]
}

/** Deterministic handoff policy evaluated after classification (and again after validation). */
export function evaluateHandoff(input: HandoffInput): HandoffDecision {
  const { classification: c, rules } = input
  const lower = input.text.toLowerCase()
  if (rules.onHumanRequest && (c.requestsHuman || c.intent === 'human_request')) return { handoff: true, code: 'human_request', reason: 'Cliente pediu para falar com uma pessoa' }
  if (rules.onComplaint && c.intent === 'complaint') return { handoff: true, code: 'complaint', reason: 'Reclamação relevante' }
  if (rules.onEmotional && (c.isEmotional || c.sentiment === 'frustrated')) return { handoff: true, code: 'emotional', reason: 'Situação emocional delicada ou cliente irritado' }
  if (rules.onDiscountRequest && (input.signals.includes('discount_request') || /desconto|abatimento|baixar o valor|fazer por menos/.test(lower))) return { handoff: true, code: 'discount_request', reason: 'Pedido de desconto/condição especial' }
  if (rules.onB2BComplex && c.intent === 'b2b_inquiry' && (input.signals.includes('large_team') || /licita|contrato|proposta formal|rfp|\b(50|100|200)\b pessoas/.test(lower))) return { handoff: true, code: 'b2b_complex', reason: 'Oportunidade B2B complexa' }
  if (rules.keywords.some((k) => lower.includes(k.toLowerCase()))) return { handoff: true, code: 'keyword', reason: 'Palavra-chave configurada pelo administrador' }
  if (rules.onRepeatedFailures > 0 && input.consecutiveBlockedRuns >= rules.onRepeatedFailures) return { handoff: true, code: 'repeated_failures', reason: 'Agente falhou repetidamente em responder com segurança' }
  if (rules.onLowConfidence && input.confidence < input.minConfidence && c.intent !== 'greeting' && c.intent !== 'smalltalk') return { handoff: true, code: 'low_confidence', reason: `Baixa confiança (${input.confidence.toFixed(2)} < ${input.minConfidence})` }
  if (rules.onHighScore && input.leadScore >= rules.onHighScore) return { handoff: true, code: 'high_score', reason: `Lead quente (score ${input.leadScore})` }
  return { handoff: false }
}
