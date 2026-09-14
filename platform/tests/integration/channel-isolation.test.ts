import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Prisma } from '@vox/db'
import { MockMessagingProvider } from '@vox/providers'
import { RUN, TEST_PHONE_NUMBER_ID, randomPhone, setupTestEnv, type TestEnv } from './helpers.js'

/**
 * Inbound routing derives the tenant from the channel's provider id. These tests pin the two
 * defenses against cross-tenant message capture: the DB refuses a duplicate external id, and the
 * processor refuses to guess when a caller pins a channel that does not exist.
 */
describe.skipIf(!RUN)('channel → tenant resolution', () => {
  let env: TestEnv
  let otherTenantId: string
  let otherUnitId: string

  beforeAll(async () => {
    env = await setupTestEnv()
    const tenant = await env.db.tenant.upsert({
      where: { slug: 'isolation-other' },
      update: {},
      create: { name: 'Other', slug: 'isolation-other' },
    })
    otherTenantId = tenant.id
    const unit = await env.db.unit.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: 'other-unit' } },
      update: {},
      create: {
        tenantId: tenant.id,
        name: 'Other unit',
        slug: 'other-unit',
        city: 'X',
        state: 'MT',
        timezone: 'America/Cuiaba',
      },
    })
    otherUnitId = unit.id
  })

  afterAll(async () => {
    if (otherTenantId)
      await env.db.tenant.delete({ where: { id: otherTenantId } }).catch(() => undefined)
  })

  it('refuses a second whatsapp channel with the same provider id in another tenant', async () => {
    await expect(
      env.db.channel.create({
        data: {
          tenantId: otherTenantId,
          unitId: otherUnitId,
          kind: 'whatsapp',
          provider: 'mock',
          externalId: TEST_PHONE_NUMBER_ID,
          name: 'Hijack',
        },
      }),
    ).rejects.toMatchObject({
      code: 'P2002',
    } satisfies Partial<Prisma.PrismaClientKnownRequestError>)
  })

  it('routes an inbound message to the tenant that owns the channel', async () => {
    const payload = MockMessagingProvider.inboundTextPayload({
      phoneNumberId: TEST_PHONE_NUMBER_ID,
      from: randomPhone(),
      text: 'oi',
    })
    const [event] = env.messaging.parseInbound(payload)
    const result = await env.processor.process(event!, { runAgent: false })
    expect(result.handled).toBe(true)
    expect(result.tenantId).toBe(env.seed.tenantId)
  })

  it('honours a pinned channel id and ignores the external id', async () => {
    const payload = MockMessagingProvider.inboundTextPayload({
      phoneNumberId: 'does-not-exist',
      from: randomPhone(),
      text: 'oi',
    })
    const [event] = env.messaging.parseInbound(payload)
    const pinned = await env.processor.process(
      { ...event!, channelId: env.seed.channelId },
      { runAgent: false },
    )
    expect(pinned.handled).toBe(true)
    expect(pinned.tenantId).toBe(env.seed.tenantId)

    const unknown = await env.processor.process(
      { ...event!, channelId: '00000000-0000-4000-8000-000000000000' },
      { runAgent: false },
    )
    expect(unknown).toMatchObject({ handled: false, reason: 'unknown_channel' })
  })
})
