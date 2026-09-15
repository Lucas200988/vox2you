import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MetaMessengerProvider } from '@vox/providers'
import { RUN, setSalesMode, setupTestEnv, type TestEnv } from './helpers.js'

/** Instagram DMs flow through the same inbox/agent as WhatsApp, with a per-channel identity and no phone. */
describe.skipIf(!RUN)('Instagram Direct channel', () => {
  let env: TestEnv
  const IG_ID = 'ig-integration-1'
  const parser = new MetaMessengerProvider({
    pageId: 'page-x',
    instagramAccountId: IG_ID,
    pageAccessToken: 't',
    appSecret: 's',
    verifyToken: 'v',
  })

  beforeAll(async () => {
    env = await setupTestEnv()
    await setSalesMode(env, 'sdr')
    await env.db.channel.upsert({
      where: { kind_externalId: { kind: 'instagram', externalId: IG_ID } },
      update: { tenantId: env.seed.tenantId, unitId: env.seed.unitId, status: 'active' },
      create: {
        tenantId: env.seed.tenantId,
        unitId: env.seed.unitId,
        kind: 'instagram',
        provider: 'meta_messenger',
        externalId: IG_ID,
        name: 'Instagram Direct',
      },
    })
  })
  afterAll(async () => {
    await env?.db.$disconnect()
  })

  it('creates a contact by Instagram identity, answers through the channel provider and keeps the 24h window', async () => {
    const psid = `psid-${Date.now()}`
    const events = parser.parseInbound({
      object: 'instagram',
      entry: [
        {
          id: IG_ID,
          messaging: [
            {
              sender: { id: psid },
              recipient: { id: IG_ID },
              timestamp: Date.now(),
              message: {
                mid: `mid-${psid}`,
                text: 'Oi! Vi o perfil de vocês, quanto custa o curso?',
              },
            },
          ],
        },
      ],
    })
    const before = env.messaging.sent.length
    const res = await env.processor.process(events[0]!)
    expect(res.handled).toBe(true)
    expect(res.run?.decision).toBe('reply')
    expect(res.run?.reply ?? '').not.toMatch(/R\$/)
    const contact = await env.db.contact.findUnique({
      where: { id: res.contactId! },
      include: { identities: true },
    })
    expect(contact?.phone).toBeNull()
    expect(contact?.source).toBe('instagram')
    expect(
      contact?.identities.some((i) => i.channel === 'instagram' && i.externalId === psid),
    ).toBe(true)
    const conv = await env.db.conversation.findUnique({
      where: { id: res.conversationId! },
      include: { channel: true },
    })
    expect(conv?.channel.kind).toBe('instagram')
    // reply went to the PSID through the channel's provider (mock in tests)
    const last = env.messaging.sent[env.messaging.sent.length - 1]!
    expect(env.messaging.sent.length).toBe(before + 1)
    expect(last.to).toBe(psid)
    // same sender again → same contact/conversation, no duplicate
    const again = await env.processor.process(
      parser.parseInbound({
        object: 'instagram',
        entry: [
          {
            id: IG_ID,
            messaging: [
              {
                sender: { id: psid },
                timestamp: Date.now() + 1000,
                message: { mid: `mid2-${psid}`, text: 'e onde fica a unidade?' },
              },
            ],
          },
        ],
      })[0]!,
    )
    expect(again.contactId).toBe(res.contactId)
    expect(again.conversationId).toBe(res.conversationId)
  })
})
