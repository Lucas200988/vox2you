import { createHmac } from 'node:crypto'
import type { DownloadedMedia, InboundEvent, MessagingProvider, OutboundInteractive, OutboundMedia, OutboundTemplate, OutboundText, ProviderTemplate, SendResult } from '@vox/core'
import { newId } from '@vox/shared'
import { MetaCloudApiProvider } from './meta-cloud.js'

export interface MockSent {
  id: string
  kind: 'text' | 'template' | 'media' | 'interactive'
  to: string
  payload: unknown
  at: Date
}

/**
 * In-memory messaging provider. Parses Meta-shaped webhooks (so the same payload fixtures work),
 * records outbound messages and lets tests/playground read them back. Signature validation uses a
 * fixed dev secret.
 */
export class MockMessagingProvider implements MessagingProvider {
  readonly name = 'mock'
  readonly sent: MockSent[] = []
  readonly appSecret: string
  readonly verifyToken: string
  private readonly meta: MetaCloudApiProvider
  private readonly listeners = new Set<(m: MockSent) => void>()

  constructor(opts: { appSecret?: string; verifyToken?: string } = {}) {
    this.appSecret = opts.appSecret ?? 'mock-app-secret'
    this.verifyToken = opts.verifyToken ?? 'mock-verify-token'
    this.meta = new MetaCloudApiProvider({ accessToken: 'mock', phoneNumberId: 'mock-phone', appSecret: this.appSecret, verifyToken: this.verifyToken })
  }

  onSend(fn: (m: MockSent) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  sign(rawBody: string): string {
    return `sha256=${createHmac('sha256', this.appSecret).update(rawBody).digest('hex')}`
  }

  verifyWebhook(query: Record<string, string | undefined>): string | null {
    return this.meta.verifyWebhook(query)
  }

  validateSignature(rawBody: string | Buffer, signatureHeader: string | undefined): boolean {
    return this.meta.validateSignature(rawBody, signatureHeader)
  }

  parseInbound(body: unknown): InboundEvent[] {
    return this.meta.parseInbound(body)
  }

  private record(kind: MockSent['kind'], to: string, payload: unknown): SendResult {
    const m: MockSent = { id: `wamid.mock.${newId()}`, kind, to, payload, at: new Date() }
    this.sent.push(m)
    for (const l of this.listeners) l(m)
    return { providerMessageId: m.id }
  }

  async sendText(msg: OutboundText): Promise<SendResult> {
    return this.record('text', msg.to, msg)
  }
  async sendTemplate(msg: OutboundTemplate): Promise<SendResult> {
    return this.record('template', msg.to, msg)
  }
  async sendMedia(msg: OutboundMedia): Promise<SendResult> {
    return this.record('media', msg.to, msg)
  }
  async sendInteractive(msg: OutboundInteractive): Promise<SendResult> {
    return this.record('interactive', msg.to, msg)
  }
  async markRead(): Promise<void> {}
  async downloadMedia(providerMediaId: string): Promise<DownloadedMedia> {
    return { buffer: Buffer.from(`mock-media:${providerMediaId}`), mimeType: 'audio/ogg' }
  }
  async listTemplates(): Promise<ProviderTemplate[]> {
    return [
      { name: 'retomada_contato', language: 'pt_BR', category: 'MARKETING', status: 'approved', components: [{ type: 'BODY', text: 'Oi {{1}}, aqui é da VOX2you. Podemos continuar nossa conversa sobre {{2}}?' }], providerId: 'mock-tpl-1', qualityScore: 'GREEN' },
      { name: 'lembrete_visita', language: 'pt_BR', category: 'UTILITY', status: 'approved', components: [{ type: 'BODY', text: 'Olá {{1}}! Lembrando da sua visita à VOX2you em {{2}}. Até lá!' }], providerId: 'mock-tpl-2', qualityScore: 'GREEN' },
    ]
  }

  /** Builds a Meta-shaped inbound text webhook payload (for tests and the simulator). */
  static inboundTextPayload(params: { phoneNumberId: string; from: string; name?: string; text: string; messageId?: string; referral?: Record<string, string> }) {
    return {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'mock-waba',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '5565999990000', phone_number_id: params.phoneNumberId },
                contacts: [{ wa_id: params.from, profile: { name: params.name ?? 'Cliente' } }],
                messages: [{ id: params.messageId ?? `wamid.${newId()}`, from: params.from, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: params.text }, ...(params.referral ? { referral: params.referral } : {}) }],
              },
            },
          ],
        },
      ],
    }
  }

  static inboundAudioPayload(params: { phoneNumberId: string; from: string; name?: string; mediaId?: string; messageId?: string }) {
    return {
      object: 'whatsapp_business_account',
      entry: [{ id: 'mock-waba', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: params.phoneNumberId }, contacts: [{ wa_id: params.from, profile: { name: params.name ?? 'Cliente' } }], messages: [{ id: params.messageId ?? `wamid.${newId()}`, from: params.from, timestamp: String(Math.floor(Date.now() / 1000)), type: 'audio', audio: { id: params.mediaId ?? 'media-1', mime_type: 'audio/ogg; codecs=opus' } }] } }] }],
    }
  }

  static statusPayload(params: { phoneNumberId: string; messageId: string; status: 'sent' | 'delivered' | 'read' | 'failed' }) {
    return { object: 'whatsapp_business_account', entry: [{ id: 'mock-waba', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: params.phoneNumberId }, statuses: [{ id: params.messageId, status: params.status, timestamp: String(Math.floor(Date.now() / 1000)) }] } }] }] }
  }
}
