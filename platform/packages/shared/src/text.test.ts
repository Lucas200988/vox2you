import { describe, expect, it } from 'vitest'
import { countQuestions, extractMoneyMentions, extractTimeMentions, parseBrlAmount, safeJsonParse, slugify } from './text.js'

describe('text utils', () => {
  it('extracts money mentions', () => {
    expect(extractMoneyMentions('O Master custa R$ 3.990,00 ou 12x de R$ 399,00')).toEqual(['R$ 3.990,00', 'R$ 399,00'])
    expect(extractMoneyMentions('custa 1.500 reais')).toEqual(['1.500 reais'])
    expect(parseBrlAmount('R$ 3.990,00')).toBe(3990)
  })
  it('extracts time mentions', () => {
    expect(extractTimeMentions('temos turma às 19h e 19:30')).toEqual(['19:00', '19:30'])
  })
  it('counts questions', () => {
    expect(countQuestions('Qual seu objetivo? E sua disponibilidade?')).toBe(2)
  })
  it('slugifies', () => {
    expect(slugify('Intensivox — Imersão')).toBe('intensivox-imersao')
  })
  it('parses JSON in code fences', () => {
    expect(safeJsonParse('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(safeJsonParse('Sure: {"a":2} thanks')).toEqual({ a: 2 })
  })
})
