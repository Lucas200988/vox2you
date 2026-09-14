import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js'

/**
 * Normalizes a phone number to E.164 (e.g. +5565999998888).
 * WhatsApp ids arrive as digits without "+" ("5565999998888"); Brazilian numbers may
 * also arrive without the 9th digit on older accounts — libphonenumber handles both.
 */
export function normalizePhone(input: string, defaultCountry: CountryCode = 'BR'): string | null {
  if (!input) return null
  const cleaned = input.trim().replace(/[^\d+]/g, '')
  if (!cleaned) return null
  const candidate = cleaned.startsWith('+') ? cleaned : `+${cleaned}`
  let parsed = parsePhoneNumberFromString(candidate)
  if (!parsed || !parsed.isPossible()) {
    parsed = parsePhoneNumberFromString(cleaned, defaultCountry)
  }
  if (!parsed || !parsed.isPossible()) return null
  return parsed.number
}

/** WhatsApp "wa_id" is E.164 without the leading plus. */
export function toWhatsAppId(e164: string): string {
  return e164.replace(/^\+/, '')
}

export function formatPhoneForDisplay(e164: string | null | undefined): string {
  if (!e164) return ''
  const parsed = parsePhoneNumberFromString(e164)
  return parsed ? parsed.formatInternational() : e164
}
