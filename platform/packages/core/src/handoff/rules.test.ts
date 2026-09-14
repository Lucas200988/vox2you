import { describe, expect, it } from 'vitest'
import type { Classification } from '@vox/shared'
import { evaluateHandoff } from './rules.js'
import { DEFAULT_HANDOFF_RULES } from '../settings/agent-settings.js'

const c = (over: Partial<Classification> = {}): Classification => ({ intent: 'info_request', secondaryIntents: [], sentiment: 'neutral', urgency: 'low', signals: [], profileType: 'unknown', needsKnowledge: false, needsCatalog: false, needsCalendar: false, requestsHuman: false, isEmotional: false, mentionsProducts: [], confidence: 0.9, ...over })
const base = { text: '', confidence: 0.9, minConfidence: 0.5, consecutiveBlockedRuns: 0, leadScore: 10, rules: DEFAULT_HANDOFF_RULES, signals: [] as string[] }

describe('evaluateHandoff', () => {
  it('hands off on explicit request, complaint, emotional, discount, complex b2b, keywords, failures, low confidence', () => {
    expect(evaluateHandoff({ ...base, classification: c({ requestsHuman: true }) }).code).toBe('human_request')
    expect(evaluateHandoff({ ...base, classification: c({ intent: 'complaint' }) }).code).toBe('complaint')
    expect(evaluateHandoff({ ...base, classification: c({ sentiment: 'frustrated' }) }).code).toBe('emotional')
    expect(evaluateHandoff({ ...base, classification: c(), text: 'tem desconto?' }).code).toBe('discount_request')
    expect(evaluateHandoff({ ...base, classification: c({ intent: 'b2b_inquiry' }), signals: ['large_team'] }).code).toBe('b2b_complex')
    expect(evaluateHandoff({ ...base, classification: c(), text: 'quero cancelar matrícula', rules: { ...DEFAULT_HANDOFF_RULES, keywords: ['cancelar matrícula'] } }).code).toBe('keyword')
    expect(evaluateHandoff({ ...base, classification: c(), consecutiveBlockedRuns: 2 }).code).toBe('repeated_failures')
    expect(evaluateHandoff({ ...base, classification: c({ confidence: 0.2 }), confidence: 0.2 }).code).toBe('low_confidence')
  })
  it('does not hand off simple b2b or normal messages', () => {
    expect(evaluateHandoff({ ...base, classification: c({ intent: 'b2b_inquiry' }) }).handoff).toBe(false)
    expect(evaluateHandoff({ ...base, classification: c({ intent: 'price_request' }) }).handoff).toBe(false)
  })
  it('honors disabled rules', () => {
    expect(evaluateHandoff({ ...base, classification: c({ requestsHuman: true }), rules: { ...DEFAULT_HANDOFF_RULES, onHumanRequest: false } }).handoff).toBe(false)
  })
})
