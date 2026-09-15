import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { MetaMessengerProvider } from './meta-messenger.js'

const cfg = {
  pageId: 'page-1',
  instagramAccountId: 'ig-1',
  pageAccessToken: 'tok',
  appSecret: 'secret',
  verifyToken: 'verify-me',
}

describe('MetaMessengerProvider', () => {
  it('parses Instagram DMs and Messenger messages with their channel kind', () => {
    const p = new MetaMessengerProvider(cfg)
    const ig = p.parseInbound({
      object: 'instagram',
      entry: [
        {
          id: 'ig-1',
          time: 1,
          messaging: [
            {
              sender: { id: 'psid-9' },
              recipient: { id: 'ig-1' },
              timestamp: 1700000000000,
              message: { mid: 'm1', text: 'Oi, quero saber do curso' },
            },
          ],
        },
      ],
    })
    expect(ig).toHaveLength(1)
    expect(ig[0]).toMatchObject({
      kind: 'message',
      channelKind: 'instagram',
      channelExternalId: 'ig-1',
      from: 'psid-9',
      text: 'Oi, quero saber do curso',
      type: 'text',
    })
    const page = p.parseInbound({
      object: 'page',
      entry: [
        {
          id: 'page-1',
          messaging: [
            {
              sender: { id: 'u1' },
              message: {
                mid: 'm2',
                attachments: [{ type: 'image', payload: { url: 'https://cdn/x.jpg' } }],
              },
            },
            {
              sender: { id: 'u1' },
              postback: { mid: 'm3', title: 'Quero visitar', payload: 'VISIT' },
            },
            { sender: { id: 'page-1' }, message: { mid: 'echo', text: 'eco', is_echo: true } },
            { sender: { id: 'u1' }, delivery: { mids: ['out-1'] } },
          ],
        },
      ],
    })
    expect(page.map((e) => e.kind)).toEqual(['message', 'message', 'status'])
    expect(page[0]).toMatchObject({
      channelKind: 'messenger',
      type: 'image',
      media: { providerMediaId: 'https://cdn/x.jpg' },
    })
    expect(page[1]).toMatchObject({
      type: 'interactive',
      interactive: { replyId: 'VISIT', title: 'Quero visitar' },
    })
    expect(page[2]).toMatchObject({
      kind: 'status',
      status: 'delivered',
      providerMessageId: 'out-1',
    })
    expect(p.parseInbound({ object: 'whatsapp_business_account', entry: [] })).toEqual([])
  })

  it('validates the X-Hub signature and the verify handshake', () => {
    const p = new MetaMessengerProvider(cfg)
    const raw = Buffer.from('{"object":"page"}')
    const sig = `sha256=${createHmac('sha256', 'secret').update(raw).digest('hex')}`
    expect(p.validateSignature(raw, sig)).toBe(true)
    expect(p.validateSignature(raw, 'sha256=00')).toBe(false)
    expect(
      p.verifyWebhook({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'verify-me',
        'hub.challenge': '42',
      }),
    ).toBe('42')
    expect(
      p.verifyWebhook({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'nope',
        'hub.challenge': '42',
      }),
    ).toBeNull()
  })

  it('sends text through the Send API of the page and refuses templates', async () => {
    const calls: Array<{ url: string; body: unknown }> = []
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init?.body)) })
      return new Response(JSON.stringify({ recipient_id: 'psid-9', message_id: 'mid.1' }), {
        status: 200,
      })
    }) as unknown as typeof fetch
    const p = new MetaMessengerProvider({ ...cfg, fetchImpl })
    const r = await p.sendText({ to: 'psid-9', text: 'Olá!' })
    expect(r.providerMessageId).toBe('mid.1')
    expect(calls[0]!.url).toContain('/page-1/messages?access_token=tok')
    expect(calls[0]!.body).toMatchObject({
      recipient: { id: 'psid-9' },
      messaging_type: 'RESPONSE',
      message: { text: 'Olá!' },
    })
    await expect(
      p.sendTemplate({ to: 'psid-9', templateName: 'x', language: 'pt_BR' }),
    ).rejects.toThrow(/templates/i)
    const quick = await p.sendInteractive({
      to: 'psid-9',
      body: 'Qual horário?',
      buttons: [{ id: 'a', title: 'Quinta 19h' }],
    })
    expect(quick.providerMessageId).toBe('mid.1')
    expect(calls[1]!.body).toMatchObject({
      message: { quick_replies: [{ content_type: 'text', title: 'Quinta 19h', payload: 'a' }] },
    })
  })
})
