/** Channel-agnostic inbound event produced by MessagingProvider.parseInbound */
export type InboundEvent =
  | {
      kind: 'message'
      /** Channel family; whatsapp when absent (legacy producers) */
      channelKind?: 'whatsapp' | 'instagram' | 'messenger'
      channelExternalId: string // phone_number_id (WhatsApp), page id (Messenger) or IG account id
      /** Resolved channel id, set only by trusted in-process callers (simulator). Wins over channelExternalId. */
      channelId?: string
      providerMessageId: string
      from: string // wa_id (digits)
      fromName?: string
      timestamp: Date
      type:
        | 'text'
        | 'audio'
        | 'image'
        | 'video'
        | 'document'
        | 'location'
        | 'interactive'
        | 'contacts'
        | 'reaction'
        | 'sticker'
        | 'unknown'
      text?: string
      media?: {
        providerMediaId: string
        mimeType?: string
        fileName?: string
        caption?: string
        sha256?: string
      }
      location?: { latitude: number; longitude: number; name?: string; address?: string }
      interactive?: { replyId: string; title: string }
      replyToProviderMessageId?: string
      referral?: {
        sourceUrl?: string
        sourceType?: string
        headline?: string
        body?: string
        ctwaClid?: string
        adId?: string
      }
      raw: unknown
    }
  | {
      kind: 'status'
      channelKind?: 'whatsapp' | 'instagram' | 'messenger'
      channelExternalId: string
      channelId?: string
      providerMessageId: string
      status: 'sent' | 'delivered' | 'read' | 'failed'
      timestamp: Date
      errorCode?: string
      errorTitle?: string
      raw: unknown
    }

export interface OutboundText {
  to: string // wa_id / E.164 digits
  text: string
  previewUrl?: boolean
  replyToProviderMessageId?: string
}

export interface OutboundTemplate {
  to: string
  templateName: string
  language: string
  bodyVariables?: string[]
  headerVariables?: string[]
  buttonVariables?: Array<{ index: number; value: string }>
}

export interface OutboundMedia {
  to: string
  kind: 'image' | 'document' | 'audio' | 'video'
  url?: string
  providerMediaId?: string
  caption?: string
  fileName?: string
}

export interface OutboundInteractive {
  to: string
  body: string
  header?: string
  footer?: string
  buttons?: Array<{ id: string; title: string }>
  list?: {
    buttonText: string
    sections: Array<{
      title: string
      rows: Array<{ id: string; title: string; description?: string }>
    }>
  }
}

export interface SendResult {
  providerMessageId: string
  raw?: unknown
}

export interface DownloadedMedia {
  buffer: Buffer
  mimeType: string
  fileName?: string
}

export interface ProviderTemplate {
  name: string
  language: string
  category: string
  status: string
  components: unknown[]
  providerId: string
  qualityScore?: string
}

export interface MessagingProvider {
  readonly name: string
  /** GET webhook challenge verification. Returns the challenge to echo back, or null if invalid. */
  verifyWebhook(query: Record<string, string | undefined>): string | null
  /** Validates the request signature over the raw body. */
  validateSignature(rawBody: string | Buffer, signatureHeader: string | undefined): boolean
  parseInbound(body: unknown): InboundEvent[]
  sendText(msg: OutboundText): Promise<SendResult>
  sendTemplate(msg: OutboundTemplate): Promise<SendResult>
  sendMedia(msg: OutboundMedia): Promise<SendResult>
  sendInteractive(msg: OutboundInteractive): Promise<SendResult>
  markRead(providerMessageId: string): Promise<void>
  downloadMedia(providerMediaId: string): Promise<DownloadedMedia>
  listTemplates(): Promise<ProviderTemplate[]>
}
