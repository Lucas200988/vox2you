import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  DownloadedMedia,
  InboundEvent,
  MessagingProvider,
  OutboundInteractive,
  OutboundMedia,
  OutboundTemplate,
  OutboundText,
  ProviderTemplate,
  SendResult,
} from '@vox/core'
import { ProviderError } from '@vox/core'

export interface MetaMessengerConfig {
  /** Facebook Page id (Messenger). */
  pageId: string
  /** Instagram professional account id linked to the page (optional). */
  instagramAccountId?: string
  pageAccessToken: string
  appSecret: string
  verifyToken: string
  graphVersion?: string
  fetchImpl?: typeof fetch
}

interface MessagingEntry {
  sender?: { id: string }
  recipient?: { id: string }
  timestamp?: number
  message?: {
    mid: string
    text?: string
    is_echo?: boolean
    attachments?: Array<{ type: string; payload?: { url?: string; sticker_id?: number } }>
    quick_reply?: { payload?: string }
    reply_to?: { mid?: string }
  }
  postback?: { mid?: string; title?: string; payload?: string }
  read?: { watermark?: number }
  delivery?: { mids?: string[]; watermark?: number }
  referral?: { ref?: string; source?: string; type?: string; ad_id?: string }
}

/**
 * Messenger + Instagram DM adapter (Meta Graph API, Send API). Same webhook signature scheme as
 * WhatsApp; events carry `channelKind` so the inbound pipeline keeps identities per channel.
 * No templates here: outside the 24h window the follow-up engine creates a task instead.
 * Docs: https://developers.facebook.com/docs/messenger-platform , /docs/instagram-platform
 */
export class MetaMessengerProvider implements MessagingProvider {
  readonly name = 'meta_messenger'
  private readonly base: string
  private readonly fetchImpl: typeof fetch

  constructor(private readonly cfg: MetaMessengerConfig) {
    this.base = `https://graph.facebook.com/${cfg.graphVersion ?? 'v21.0'}`
    this.fetchImpl = cfg.fetchImpl ?? fetch
  }

  verifyWebhook(query: Record<string, string | undefined>): string | null {
    const mode = query['hub.mode']
    const token = query['hub.verify_token']
    const challenge = query['hub.challenge']
    if (mode === 'subscribe' && token && challenge && safeEqual(token, this.cfg.verifyToken))
      return challenge
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
    const b = body as {
      object?: string
      entry?: Array<{ id?: string; messaging?: MessagingEntry[] }>
    }
    const channelKind =
      b?.object === 'instagram' ? 'instagram' : b?.object === 'page' ? 'messenger' : null
    if (!channelKind) return events
    for (const entry of b.entry ?? []) {
      // the entry id is the page id (Messenger) or the Instagram account id
      const channelExternalId = entry.id ?? ''
      for (const m of entry.messaging ?? []) {
        const ts = new Date(m.timestamp ?? Date.now())
        const from = m.sender?.id ?? ''
        if (m.message && !m.message.is_echo) {
          const att = m.message.attachments?.[0]
          const type = att ? normalizeType(att.type) : m.message.text ? 'text' : 'unknown'
          const ev: InboundEvent = {
            kind: 'message',
            channelKind,
            channelExternalId,
            providerMessageId: m.message.mid,
            from,
            timestamp: ts,
            type,
            raw: m,
          }
          if (m.message.text) ev.text = m.message.text
          if (m.message.quick_reply?.payload)
            ev.interactive = {
              replyId: m.message.quick_reply.payload,
              title: m.message.text ?? m.message.quick_reply.payload,
            }
          if (att?.payload?.url)
            ev.media = { providerMediaId: att.payload.url, mimeType: mimeFor(att.type) }
          if (m.message.reply_to?.mid) ev.replyToProviderMessageId = m.message.reply_to.mid
          if (m.referral)
            ev.referral = {
              sourceType: m.referral.source ?? m.referral.type,
              body: m.referral.ref,
              adId: m.referral.ad_id,
            }
          events.push(ev)
        } else if (m.postback) {
          events.push({
            kind: 'message',
            channelKind,
            channelExternalId,
            providerMessageId: m.postback.mid ?? `postback-${from}-${ts.getTime()}`,
            from,
            timestamp: ts,
            type: 'interactive',
            text: m.postback.title,
            interactive: { replyId: m.postback.payload ?? '', title: m.postback.title ?? '' },
            raw: m,
          })
        } else if (m.delivery?.mids?.length) {
          for (const mid of m.delivery.mids)
            events.push({
              kind: 'status',
              channelKind,
              channelExternalId,
              providerMessageId: mid,
              status: 'delivered',
              timestamp: ts,
              raw: m,
            })
        }
        // read receipts carry only a watermark (no message ids): nothing to map
      }
    }
    return events
  }

  async sendText(msg: OutboundText): Promise<SendResult> {
    return this.send({
      recipient: { id: msg.to },
      messaging_type: 'RESPONSE',
      message: { text: msg.text },
    })
  }

  async sendTemplate(_msg: OutboundTemplate): Promise<SendResult> {
    throw new ProviderError(
      'meta_messenger',
      'Messenger/Instagram não têm templates aprovados: fora da janela de 24h só é possível abrir tarefa para o consultor',
      'templates_unsupported',
    )
  }

  async sendMedia(msg: OutboundMedia): Promise<SendResult> {
    if (!msg.url)
      throw new ProviderError(
        'meta_messenger',
        'sendMedia requires a public url',
        'media_url_required',
      )
    const type = msg.kind === 'document' ? 'file' : msg.kind
    return this.send({
      recipient: { id: msg.to },
      messaging_type: 'RESPONSE',
      message: { attachment: { type, payload: { url: msg.url, is_reusable: false } } },
    })
  }

  async sendInteractive(msg: OutboundInteractive): Promise<SendResult> {
    const quick_replies = (msg.buttons ?? [])
      .slice(0, 13)
      .map((b) => ({ content_type: 'text', title: b.title.slice(0, 20), payload: b.id }))
    return this.send({
      recipient: { id: msg.to },
      messaging_type: 'RESPONSE',
      message: {
        text: [msg.header, msg.body, msg.footer].filter(Boolean).join('\n'),
        ...(quick_replies.length ? { quick_replies } : {}),
      },
    })
  }

  async markRead(providerMessageId: string): Promise<void> {
    // Messenger marks by recipient, not by message id; the id is not enough here → no-op
    void providerMessageId
  }

  async downloadMedia(providerMediaId: string): Promise<DownloadedMedia> {
    // For Messenger/Instagram the "media id" is the CDN url from the webhook
    const res = await this.fetchImpl(providerMediaId)
    if (!res.ok)
      throw new ProviderError(
        'meta_messenger',
        `media download failed: ${res.status}`,
        'media_download_failed',
      )
    return {
      buffer: Buffer.from(await res.arrayBuffer()),
      mimeType: res.headers.get('content-type') ?? 'application/octet-stream',
    }
  }

  async listTemplates(): Promise<ProviderTemplate[]> {
    return []
  }

  private async send(payload: Record<string, unknown>): Promise<SendResult> {
    const res = await this.fetchImpl(
      `${this.base}/${this.cfg.pageId}/messages?access_token=${encodeURIComponent(this.cfg.pageAccessToken)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      },
    )
    const json = (await res.json().catch(() => ({}))) as {
      message_id?: string
      error?: { message?: string; code?: number }
    }
    if (!res.ok || !json.message_id)
      throw new ProviderError(
        'meta_messenger',
        json.error?.message ?? `Send API ${res.status}`,
        String(json.error?.code ?? res.status),
      )
    return { providerMessageId: json.message_id, raw: json }
  }
}

type InboundMessageType = Extract<InboundEvent, { kind: 'message' }>['type']

function normalizeType(t: string): InboundMessageType {
  switch (t) {
    case 'image':
    case 'audio':
    case 'video':
      return t
    case 'file':
      return 'document'
    case 'location':
      return 'location'
    case 'sticker':
      return 'sticker'
    default:
      return 'unknown'
  }
}

function mimeFor(t: string): string | undefined {
  return {
    image: 'image/jpeg',
    audio: 'audio/mp4',
    video: 'video/mp4',
    file: 'application/octet-stream',
  }[t]
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}
