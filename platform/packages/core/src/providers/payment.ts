/**
 * Amounts are computed server-side from Offer + rules. The LLM never sets amounts.
 */
export interface ChargeInput {
  tenantId: string
  contactId: string
  dealId?: string
  amount: number
  currency: string
  description: string
  method?: 'pix' | 'boleto' | 'card'
  payerName?: string
  payerEmail?: string
  payerPhone?: string
  idempotencyKey: string
}

export interface Charge {
  externalId: string
  status: 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled'
  paymentUrl?: string
  raw?: unknown
}

export interface PaymentProvider {
  readonly name: string
  createCharge(input: ChargeInput): Promise<Charge>
  getCharge(externalId: string): Promise<Charge>
  parseWebhook(body: unknown, headers: Record<string, string | undefined>): { externalId: string; status: Charge['status'] } | null
}
