import type { Charge, ChargeInput, PaymentProvider } from '@vox/core'
import { newId } from '@vox/shared'

/**
 * Mock payment provider. Real adapters (Mercado Pago, Asaas, Pagar.me, Stripe) implement the same
 * contract; amounts always come from Offer rules computed server-side.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock'
  readonly charges = new Map<string, Charge & { input: ChargeInput }>()

  async createCharge(input: ChargeInput): Promise<Charge> {
    const existing = [...this.charges.values()].find((c) => c.input.idempotencyKey === input.idempotencyKey)
    if (existing) return existing
    const charge: Charge & { input: ChargeInput } = { externalId: `mockpay_${newId()}`, status: 'pending', paymentUrl: `https://pay.mock.local/${input.idempotencyKey}`, input }
    this.charges.set(charge.externalId, charge)
    return charge
  }

  async getCharge(externalId: string): Promise<Charge> {
    const c = this.charges.get(externalId)
    if (!c) throw new Error('charge not found')
    return c
  }

  parseWebhook(body: unknown): { externalId: string; status: Charge['status'] } | null {
    const b = body as { externalId?: string; status?: Charge['status'] }
    if (!b?.externalId || !b.status) return null
    const c = this.charges.get(b.externalId)
    if (c) c.status = b.status
    return { externalId: b.externalId, status: b.status }
  }
}
