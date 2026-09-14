import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { MetaCloudApiProvider } from './meta-cloud.js'
import { MockMessagingProvider } from './mock.js'

const provider = new MetaCloudApiProvider({ accessToken: 't', phoneNumberId: '123', appSecret: 'secret', verifyToken: 'verify' })

describe('MetaCloudApiProvider', () => {
  it('verifies webhook challenge', () => {
    expect(provider.verifyWebhook({ 'hub.mode': 'subscribe', 'hub.verify_token': 'verify', 'hub.challenge': 'abc' })).toBe('abc')
    expect(provider.verifyWebhook({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': 'abc' })).toBeNull()
  })

  it('validates HMAC signature over raw body', () => {
    const body = JSON.stringify({ hello: 'world' })
    const sig = `sha256=${createHmac('sha256', 'secret').update(body).digest('hex')}`
    expect(provider.validateSignature(body, sig)).toBe(true)
    expect(provider.validateSignature(body, 'sha256=deadbeef')).toBe(false)
    expect(provider.validateSignature(body, undefined)).toBe(false)
  })

  it('parses inbound text, audio, interactive, referral and statuses', () => {
    const text = MockMessagingProvider.inboundTextPayload({ phoneNumberId: '123', from: '5565999998888', name: 'Ana', text: 'Oi', referral: { source_url: 'https://fb.com/ad', ctwa_clid: 'clid1', headline: 'Oratória' } })
    const events = provider.parseInbound(text)
    expect(events).toHaveLength(1)
    const ev = events[0]!
    expect(ev.kind).toBe('message')
    if (ev.kind === 'message') {
      expect(ev.from).toBe('5565999998888')
      expect(ev.fromName).toBe('Ana')
      expect(ev.text).toBe('Oi')
      expect(ev.referral?.ctwaClid).toBe('clid1')
      expect(ev.channelExternalId).toBe('123')
    }
    const audio = provider.parseInbound(MockMessagingProvider.inboundAudioPayload({ phoneNumberId: '123', from: '5565999998888' }))[0]!
    expect(audio.kind === 'message' && audio.type === 'audio' && audio.media?.providerMediaId).toBe('media-1')

    const status = provider.parseInbound(MockMessagingProvider.statusPayload({ phoneNumberId: '123', messageId: 'wamid.1', status: 'read' }))[0]!
    expect(status.kind).toBe('status')
    if (status.kind === 'status') expect(status.status).toBe('read')

    const interactive = provider.parseInbound({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: '123' }, messages: [{ id: 'm1', from: '1', timestamp: '1700000000', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'yes', title: 'Sim' } } }] } }] }] })[0]!
    expect(interactive.kind === 'message' && interactive.text).toBe('Sim')
  })

  it('ignores non-whatsapp payloads', () => {
    expect(provider.parseInbound({ object: 'page' })).toEqual([])
  })
})
