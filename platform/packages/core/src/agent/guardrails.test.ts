import { describe, expect, it } from 'vitest'
import { runGuardrails } from './guardrails.js'
import type { MemorySnapshot } from './types.js'
import type { AgentCatalog } from '../catalog/product-service.js'

const memory: MemorySnapshot = {
  contact: { id: 'c', name: 'Ana', firstName: 'Ana', phone: null, email: null, profileType: null, source: null, city: null },
  lead: null,
  conversation: { id: 'x', mode: 'ai', summary: null, lastInboundAt: new Date(), channelKind: 'whatsapp', channelId: 'ch', contactId: 'c', unitId: 'u', leadId: null },
  recent: [{ id: '1', direction: 'outbound', authorType: 'agent', text: 'Qual período fica melhor pra você?', createdAt: new Date() }],
  facts: [{ id: 'f', key: 'preferred_period', value: 'noite', source: 'stated', confidence: 0.9 }],
  inboundCount: 2,
  outboundCount: 1,
  appointmentsCount: 0,
  consecutiveBlockedRuns: 0,
  optedOut: false,
}

const catalog: AgentCatalog = [
  { id: 'p', slug: 'academy', name: 'Academy', category: 'course', modality: null, audience: null, shortDescription: null, personas: [], painsSolved: [], benefits: [], durationText: null, format: null, salesArguments: [], objectionHandlers: [], offers: [{ id: 'o', name: 'Regular', listPrice: 3990, promoPrice: null, installmentsMax: 12, installmentValue: 332.5, conditions: null, paymentMethods: [], maxDiscountPct: 10, discountRequiresApproval: true, validTo: null, display: 'R$ 3.990,00 ou 12x de R$ 332,50' }], classes: [{ id: 'cl', name: 'Noite', startsOn: '2026-10-01', weekdays: ['tue'], startTime: '19:00', endTime: '21:00', period: 'evening', seatsLeft: 3, status: 'open' }] },
]

const base = { catalog, knowledge: [], slots: null, memory, maxChars: 600, maxQuestions: 1, timezone: 'America/Cuiaba' }

describe('runGuardrails', () => {
  it('accepts prices and times that exist in the catalog', () => {
    const r = runGuardrails({ ...base, reply: 'O Academy custa R$ 3.990,00 ou 12x de R$ 332,50, com turma às 19:00.' })
    expect(r.ok).toBe(true)
    expect(r.issues.filter((i) => i.severity === 'block')).toEqual([])
  })
  it('blocks unsupported prices, times, discounts and guarantees', () => {
    const r = runGuardrails({ ...base, reply: 'Custa R$ 2.500,00 com 30% de desconto, turma às 20:30, resultado garantido, últimas vagas!' })
    const codes = r.issues.map((i) => i.code)
    expect(r.ok).toBe(false)
    expect(codes).toEqual(expect.arrayContaining(['unsupported_price', 'unauthorized_discount', 'unsupported_time', 'guaranteed_result', 'false_scarcity']))
  })
  it('flags repeated and already-answered questions and trims long replies', () => {
    const long = 'Qual período fica melhor pra você? '.repeat(30)
    const r = runGuardrails({ ...base, reply: long })
    const codes = r.issues.map((i) => i.code)
    expect(codes).toContain('repeated_question')
    expect(codes).toContain('asks_known_fact')
    expect(codes).toContain('too_long')
    expect(r.ok).toBe(true)
    expect(r.rewrittenReply!.length).toBeLessThanOrEqual(600)
  })
  it('allows echoing a time the customer mentioned', () => {
    const r = runGuardrails({ ...base, memory: { ...memory, recent: [{ id: '2', direction: 'inbound', authorType: 'contact', text: 'posso às 15h', createdAt: new Date() }] }, reply: 'Perfeito, às 15:00 então.' })
    expect(r.ok).toBe(true)
  })
})
