import type { ConversionEventInput, ConversionProvider } from '@vox/core'

/** Records conversion events locally. Meta CAPI adapter (PENDING credential) implements the same contract. */
export class NoopConversionProvider implements ConversionProvider {
  readonly name = 'noop'
  readonly events: ConversionEventInput[] = []
  async track(event: ConversionEventInput): Promise<{ accepted: boolean }> {
    this.events.push(event)
    return { accepted: true }
  }
}

export interface MetaCapiConfig {
  pixelId: string
  accessToken: string
  testEventCode?: string
  fetchImpl?: typeof fetch
}

/** Meta Conversions API adapter (server-side events for Click-to-WhatsApp attribution). */
export class MetaCapiConversionProvider implements ConversionProvider {
  readonly name = 'meta_capi'
  constructor(private readonly cfg: MetaCapiConfig) {}

  async track(event: ConversionEventInput): Promise<{ accepted: boolean; raw?: unknown }> {
    const payload = {
      data: [
        {
          event_name: event.eventName,
          event_time: Math.floor(event.eventTime.getTime() / 1000),
          event_id: event.eventId,
          action_source: 'chat',
          user_data: { ph: event.user.phoneHash ? [event.user.phoneHash] : undefined, em: event.user.emailHash ? [event.user.emailHash] : undefined, external_id: event.user.externalId ? [event.user.externalId] : undefined, ctwa_clid: event.user.ctwaClid, fbc: event.user.fbclid ? `fb.1.${Date.now()}.${event.user.fbclid}` : undefined },
          custom_data: { currency: event.currency ?? 'BRL', value: event.value, ...event.custom },
        },
      ],
      ...(this.cfg.testEventCode ? { test_event_code: this.cfg.testEventCode } : {}),
    }
    const res = await (this.cfg.fetchImpl ?? fetch)(`https://graph.facebook.com/v21.0/${this.cfg.pixelId}/events?access_token=${encodeURIComponent(this.cfg.accessToken)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const raw = await res.json().catch(() => ({}))
    return { accepted: res.ok, raw }
  }
}
