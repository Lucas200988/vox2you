import { describe, expect, it } from 'vitest'
import { normalizePhone, toWhatsAppId } from './phone.js'

describe('normalizePhone', () => {
  it('normalizes a WhatsApp wa_id (digits only) to E.164', () => {
    expect(normalizePhone('5565999998888')).toBe('+5565999998888')
  })
  it('normalizes local BR numbers with formatting', () => {
    expect(normalizePhone('(65) 99999-8888')).toBe('+5565999998888')
  })
  it('keeps already valid E.164', () => {
    expect(normalizePhone('+5511987654321')).toBe('+5511987654321')
  })
  it('returns null for garbage', () => {
    expect(normalizePhone('abc')).toBeNull()
    expect(normalizePhone('')).toBeNull()
  })
  it('converts back to wa_id', () => {
    expect(toWhatsAppId('+5565999998888')).toBe('5565999998888')
  })
})
