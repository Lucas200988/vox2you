import {
  CampaignService,
  ConsentService,
  inSendWindow,
  renderVariables,
  systemContext,
} from '@vox/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inbound, randomPhone, RUN, setupTestEnv, type TestEnv } from './helpers.js'

/**
 * Campaigns: segment → recipients → throttled template sends inside the send window → replies
 * attributed within 72h. Opted-out contacts never receive anything.
 */
describe.skipIf(!RUN)('Campaigns', () => {
  let env: TestEnv
  let service: CampaignService
  let templateId: string
  const phones = [randomPhone(), randomPhone(), randomPhone()]
  const tag = `camp-${Date.now()}`

  beforeAll(async () => {
    env = await setupTestEnv()
    service = new CampaignService(env.db, { providers: env.providers, realtime: env.realtime })
    const tpl = await env.db.messageTemplate.upsert({
      where: {
        tenantId_name_language: {
          tenantId: env.seed.tenantId,
          name: 'campanha_teste',
          language: 'pt_BR',
        },
      },
      update: { status: 'approved' },
      create: {
        tenantId: env.seed.tenantId,
        name: 'campanha_teste',
        language: 'pt_BR',
        category: 'MARKETING',
        status: 'approved',
        variables: ['1', '2'],
        body: 'Oi {{1}}! Temos uma novidade sobre {{2}}. Quer saber mais?',
      },
    })
    templateId = tpl.id
    // three leads with a distinctive tag; the third opts out
    for (const phone of phones) {
      const res = await inbound(env, phone, 'Oi, quero saber sobre o curso', {
        name: `Lead ${phone.slice(-4)}`,
      })
      const t = await env.db.tag.upsert({
        where: { tenantId_name: { tenantId: env.seed.tenantId, name: tag } },
        update: {},
        create: { tenantId: env.seed.tenantId, name: tag },
      })
      await env.db.leadTag.create({ data: { leadId: res.leadId!, tagId: t.id } })
    }
    const third = await env.db.contact.findFirst({
      where: { tenantId: env.seed.tenantId, phone: { endsWith: phones[2]!.slice(-8) } },
    })
    await env.db.$transaction((tx) =>
      ConsentService.set(
        tx,
        systemContext(env.seed.tenantId),
        third!.id,
        'marketing',
        'opted_out',
        'test',
      ),
    )
  })
  afterAll(async () => {
    await env?.db.$disconnect()
  })

  it('renders variables and respects the local send window', () => {
    expect(
      renderVariables(['{{firstName}}', 'curso de {{productName}}', ''], {
        firstName: 'Ana',
        productName: 'Oratória',
      }),
    ).toEqual(['Ana', 'curso de Oratória', '-'])
    const noon = new Date('2026-09-15T15:00:00Z') // 12:00 in America/Cuiaba (UTC-4)
    expect(inSendWindow({ start: '08:00', end: '20:00' }, 'America/Cuiaba', noon)).toBe(true)
    expect(inSendWindow({ start: '13:00', end: '20:00' }, 'America/Cuiaba', noon)).toBe(false)
    expect(inSendWindow(undefined, 'America/Cuiaba', noon)).toBe(true)
  })

  it('previews the segment, excludes opted-out contacts, sends throttled and attributes replies', async () => {
    const ctx = systemContext(env.seed.tenantId)
    const t = await env.db.tag.findFirst({ where: { tenantId: env.seed.tenantId, name: tag } })
    const segment = { tagIds: [t!.id], sendWindow: { start: '00:00', end: '23:59' } }
    const preview = await service.preview(ctx, env.seed.unitId, segment)
    expect(preview.total).toBe(2)

    const created = await service.create(ctx, {
      name: 'Reativação',
      unitId: env.seed.unitId,
      templateId,
      segment,
      variables: ['{{firstName}}', '{{productName}}'],
      rateLimitPerMin: 1,
    })
    expect(created.status).toBe('draft')
    const scheduled = await service.schedule(ctx, created.id)
    expect(scheduled.status).toBe('scheduled')
    expect(scheduled.stats.total).toBe(2)

    const before = env.messaging.sent.filter((m) => m.kind === 'template').length
    const tick1 = await service.processTick()
    const mine = tick1.find((x) => x.campaignId === created.id)
    expect(mine).toMatchObject({ sent: 1, failed: 0 }) // rate limit 1/min
    const tick2 = await service.processTick()
    expect(tick2.find((x) => x.campaignId === created.id)).toMatchObject({ sent: 1 })
    const tick3 = await service.processTick()
    expect(tick3.find((x) => x.campaignId === created.id)?.done).toBe(true)
    expect(env.messaging.sent.filter((m) => m.kind === 'template').length).toBe(before + 2)
    const sentTo = env.messaging.sent
      .filter((m) => m.kind === 'template')
      .slice(-2)
      .map((m) => m.to.replace(/\D/g, '').slice(-8))
    expect(sentTo).not.toContain(phones[2]!.slice(-8))

    const done = await service.get(ctx, created.id)
    expect(done.status).toBe('completed')
    expect(done.stats.sent).toBe(2)
    const messages = await env.db.message.findMany({
      where: {
        id: {
          in: (await service.recipients(ctx, created.id)).map((r) => r.messageId!).filter(Boolean),
        },
      },
    })
    expect(
      messages.every((m) => m.type === 'template' && m.templateName === 'campanha_teste'),
    ).toBe(true)
    expect(messages[0]!.text).toMatch(/^Oi Lead!/)

    // a reply from one recipient is attributed to the campaign
    await inbound(env, phones[0]!, 'Quero sim!')
    const after = await service.get(ctx, created.id)
    expect(after.stats.replied).toBe(1)
    expect(after.stats.replyRate).toBeCloseTo(0.5)
  })

  it('refuses to schedule without an approved template and pauses/cancels safely', async () => {
    const ctx = systemContext(env.seed.tenantId)
    const c = await service.create(ctx, {
      name: 'Sem template',
      unitId: env.seed.unitId,
      templateId: null,
      segment: {},
      variables: [],
    })
    await expect(service.schedule(ctx, c.id)).rejects.toThrow(/template/i)
    const withTpl = await service.create(ctx, {
      name: 'Pausável',
      unitId: env.seed.unitId,
      templateId,
      segment: { minScore: 101 },
      variables: ['a', 'b'],
    })
    const s = await service.schedule(ctx, withTpl.id, new Date(Date.now() + 864e5))
    expect(s.status).toBe('scheduled')
    expect((await service.pause(ctx, withTpl.id)).status).toBe('paused')
    expect((await service.resume(ctx, withTpl.id)).status).toBe('running')
    expect((await service.cancel(ctx, withTpl.id)).status).toBe('cancelled')
  })
})
