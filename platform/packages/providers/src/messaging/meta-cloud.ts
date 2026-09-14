import { createHmac, timingSafeEqual } from 'node:crypto'
import type { DownloadedMedia, InboundEvent, MessagingProvider, OutboundInteractive, OutboundMedia, OutboundTemplate, OutboundText, ProviderTemplate, SendResult } from '@vox/core'
import { ProviderError } from '@vox/core'

export interface MetaCloudConfig {
  accessToken: string
  phoneNumberId: string
  businessAccountId?: string
  appSecret: string
  verifyToken: string
  graphVersion?: string
  fetchImpl?: typeof fetch
}

/**
 * WhatsApp Business Platform (Meta Cloud API) adapter.
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 */
export class MetaCloudApiProvider implements MessagingProvider {
  readonly name = 'meta'
  private readonly base: string
  private readonly fetchImpl: typeof fetch

  constructor(private readonly cfg: MetaCloudConfig) {
    this.base = `https://graph.facebook.com/${cfg.graphVersion ?? 'v21.0'}`
    this.fetchImpl = cfg.fetchImpl ?? fetch
  }

  verifyWebhook(query: Record<string, string | undefined>): string | null {
    const mode = query['hub.mode']
    const token = query['hub.verify_token']
    const challenge = query['hub.challenge']
    if (mode === 'subscribe' && token && challenge && safeEqual(token, this.cfg.verifyToken)) return challenge
    return null
  }

  validateSignature(rawBody: string | Buffer, signatureHeader: string | undefined): boolean {
    if (!signatureHeader || !this.cfg.appSecret) return false
    const [algo, given] = signatureHeader.split('=')
    if (algo !== 'sha256' || !given) return false
    const expected = createHmac('sha256', this.cfg.appSecret).update(rawBody).digest('hex')
    return safeEqual(expected, given)
  }

  parseInbound(body: unknown): InboundEvent[] {
    const events: InboundEvent[] = []
    const b = body as { object?: string; entry?: Array<{ changes?: Array<{ field?: string; value?: MetaValue }> }> }
    if (b?.object !== 'whatsapp_business_account') return events
    for (const entry of b.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const v = change.value
        if (!v || change.field !== 'messages') continue
        const channelExternalId = v.metadata?.phone_number_id ?? ''
        const names = new Map((v.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]))
        for (const m of v.messages ?? []) {
          const ts = new Date(Number(m.timestamp) * 1000)
          const type = normalizeType(m.type)
          const ev: InboundEvent = { kind: 'message', channelExternalId, providerMessageId: m.id, from: m.from, fromName: names.get(m.from), timestamp: ts, type, raw: m }
          if (m.text?.body) ev.text = m.text.body
          const media = m.audio ?? m.image ?? m.video ?? m.document ?? m.sticker
          if (media?.id) ev.media = { providerMediaId: media.id, mimeType: media.mime_type, fileName: m.document?.filename, caption: m.image?.caption ?? m.video?.caption ?? m.document?.caption, sha256: media.sha256 }
          if (m.location) ev.location = { latitude: m.location.latitude, longitude: m.location.longitude, name: m.location.name, address: m.location.address }
          if (m.interactive) {
            const r = m.interactive.button_reply ?? m.interactive.list_reply
            if (r) {
              ev.interactive = { replyId: r.id, title: r.title }
              ev.text = r.title
            }
          }
          if (m.button?.text) ev.text = m.button.text
          if (m.context?.id) ev.replyToProviderMessageId = m.context.id
          if (m.referral) ev.referral = { sourceUrl: m.referral.source_url, sourceType: m.referral.source_type, headline: m.referral.headline, body: m.referral.body, ctwaClid: m.referral.ctwa_clid, adId: m.referral.source_id }
          events.push(ev)
        }
        for (const s of v.statuses ?? []) {
          const status = s.status === 'sent' || s.status === 'delivered' || s.status === 'read' || s.status === 'failed' ? s.status : null
          if (!status) continue
          const err = s.errors?.[0]
          events.push({ kind: 'status', channelExternalId, providerMessageId: s.id, status, timestamp: new Date(Number(s.timestamp) * 1000), errorCode: err ? String(err.code) : undefined, errorTitle: err?.title, raw: s })
        }
      }
    }
    return events
  }

  async sendText(msg: OutboundText): Promise<SendResult> {
    return this.post({ messaging_product: 'whatsapp', recipient_type: 'individual', to: msg.to, type: 'text', text: { body: msg.text, preview_url: msg.previewUrl ?? false }, ...(msg.replyToProviderMessageId ? { context: { message_id: msg.replyToProviderMessageId } } : {}) })
  }

  async sendTemplate(msg: OutboundTemplate): Promise<SendResult> {
    const components: unknown[] = []
    if (msg.headerVariables?.length) components.push({ type: 'header', parameters: msg.headerVariables.map((text) => ({ type: 'text', text })) })
    if (msg.bodyVariables?.length) components.push({ type: 'body', parameters: msg.bodyVariables.map((text) => ({ type: 'text', text })) })
    for (const b of msg.buttonVariables ?? []) components.push({ type: 'button', sub_type: 'url', index: String(b.index), parameters: [{ type: 'text', text: b.value }] })
    return this.post({ messaging_product: 'whatsapp', to: msg.to, type: 'template', template: { name: msg.templateName, language: { code: msg.language }, components } })
  }

  async sendMedia(msg: OutboundMedia): Promise<SendResult> {
    const ref = msg.providerMediaId ? { id: msg.providerMediaId } : { link: msg.url }
    return this.post({ messaging_product: 'whatsapp', to: msg.to, type: msg.kind, [msg.kind]: { ...ref, ...(msg.caption ? { caption: msg.caption } : {}), ...(msg.fileName && msg.kind === 'document' ? { filename: msg.fileName } : {}) } })
  }

  async sendInteractive(msg: OutboundInteractive): Promise<SendResult> {
    const interactive = msg.list
      ? { type: 'list', body: { text: msg.body }, ...(msg.header ? { header: { type: 'text', text: msg.header } } : {}), ...(msg.footer ? { footer: { text: msg.footer } } : {}), action: { button: msg.list.buttonText, sections: msg.list.sections } }
      : { type: 'button', body: { text: msg.body }, ...(msg.header ? { header: { type: 'text', text: msg.header } } : {}), ...(msg.footer ? { footer: { text: msg.footer } } : {}), action: { buttons: (msg.buttons ?? []).slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title.slice(0, 20) } })) } }
    return this.post({ messaging_product: 'whatsapp', to: msg.to, type: 'interactive', interactive })
  }

  async markRead(providerMessageId: string): Promise<void> {
    await this.post({ messaging_product: 'whatsapp', status: 'read', message_id: providerMessageId })
  }

  async downloadMedia(providerMediaId: string): Promise<DownloadedMedia> {
    const meta = await this.request<{ url: string; mime_type: string; file_size?: number }>(`/${providerMediaId}`)
    const res = await this.fetchImpl(meta.url, { headers: { Authorization: `Bearer ${this.cfg.accessToken}` } })
    if (!res.ok) throw new ProviderError('meta', `media download failed: ${res.status}`)
    const buffer = Buffer.from(await res.arrayBuffer())
    return { buffer, mimeType: meta.mime_type }
  }

  async listTemplates(): Promise<ProviderTemplate[]> {
    if (!this.cfg.businessAccountId) return []
    const data = await this.request<{ data: Array<{ id: string; name: string; language: string; category: string; status: string; components: unknown[]; quality_score?: { score: string } }> }>(`/${this.cfg.businessAccountId}/message_templates?fields=id,name,language,category,status,components,quality_score&limit=200`)
    return data.data.map((t) => ({ name: t.name, language: t.language, category: t.category, status: t.status.toLowerCase(), components: t.components, providerId: t.id, qualityScore: t.quality_score?.score }))
  }

  private async post(payload: Record<string, unknown>): Promise<SendResult> {
    const data = await this.request<{ messages?: Array<{ id: string }> }>(`/${this.cfg.phoneNumberId}/messages`, { method: 'POST', body: JSON.stringify(payload) })
    return { providerMessageId: data.messages?.[0]?.id ?? '', raw: data }
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.fetchImpl(`${this.base}${path}`, { ...init, headers: { Authorization: `Bearer ${this.cfg.accessToken}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } })
    const text = await res.text()
    let json: unknown = {}
    try {
      json = text ? JSON.parse(text) : {}
    } catch {
      json = { raw: text }
    }
    if (!res.ok) {
      const err = (json as { error?: { message?: string; code?: number; error_subcode?: number } }).error
      throw new ProviderError('meta', `${res.status} ${err?.message ?? text}`, { code: err?.code, subcode: err?.error_subcode, retryable: res.status >= 500 || res.status === 429 })
    }
    return json as T
  }
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

type InboundMessageType = Extract<InboundEvent, { kind: 'message' }>['type']

function normalizeType(t: string | undefined): InboundMessageType {
  switch (t) {
    case 'text':
    case 'audio':
    case 'image':
    case 'video':
    case 'document':
    case 'location':
    case 'interactive':
    case 'contacts':
    case 'reaction':
    case 'sticker':
      return t
    case 'button':
      return 'interactive'
    default:
      return 'unknown'
  }
}

interface MetaMedia {
  id: string
  mime_type?: string
  sha256?: string
  caption?: string
  filename?: string
}

interface MetaMessage {
  id: string
  from: string
  timestamp: string
  type: string
  text?: { body: string }
  audio?: MetaMedia
  image?: MetaMedia
  video?: MetaMedia
  document?: MetaMedia
  sticker?: MetaMedia
  location?: { latitude: number; longitude: number; name?: string; address?: string }
  interactive?: { type: string; button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string } }
  button?: { text: string; payload?: string }
  context?: { id: string; from?: string }
  referral?: { source_url?: string; source_type?: string; source_id?: string; headline?: string; body?: string; ctwa_clid?: string }
}

interface MetaValue {
  messaging_product?: string
  metadata?: { display_phone_number?: string; phone_number_id?: string }
  contacts?: Array<{ wa_id: string; profile?: { name?: string } }>
  messages?: MetaMessage[]
  statuses?: Array<{ id: string; status: string; timestamp: string; recipient_id?: string; errors?: Array<{ code: number; title: string }> }>
}
