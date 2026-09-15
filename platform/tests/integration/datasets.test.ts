import { DatasetService, check, systemContext } from '@vox/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inbound, randomPhone, RUN, setSalesMode, setupTestEnv, type TestEnv } from './helpers.js'

/** Regression datasets: saved customer turns with expectations, run and compared A/B in sandbox. */
describe.skipIf(!RUN)('Datasets and A/B comparison', () => {
  let env: TestEnv
  let service: DatasetService
  const ctxOf = () => {
    const ctx = systemContext(env.seed.tenantId, 'user:test')
    ctx.userId = env.seed.adminUserId
    return ctx
  }

  beforeAll(async () => {
    env = await setupTestEnv()
    await setSalesMode(env, 'sdr')
    service = new DatasetService(env.db, env.deps)
  })
  afterAll(async () => {
    await env?.db.$disconnect()
  })

  it('checks expectations rule by rule', () => {
    const run = {
      reply: 'Os valores a gente apresenta na visita. Posso reservar quinta às 19h?',
      decision: 'reply',
      classification: { intent: 'price_request', signals: [] },
      validation: { ok: true, issues: [] },
    } as unknown as Parameters<typeof check>[0]
    expect(
      check(run, { intent: 'price_request', mustNotMatch: ['R\\$'], mustInclude: ['visita'] }),
    ).toEqual([])
    const failures = check(run, {
      decision: 'handoff',
      mustNotInclude: ['visita'],
      mustNotMatch: ['['],
    })
    expect(failures).toHaveLength(3)
    expect(failures.join(' ')).toMatch(/decisão reply ≠ handoff/)
    expect(failures.join(' ')).toMatch(/regex inválida/)
  })

  it('runs a dataset in sandbox conversations and reports pass/fail per item', async () => {
    const ctx = ctxOf()
    const dataset = await service.create(ctx, { name: `SDR básico ${Date.now()}` })
    await service.addItem(
      ctx,
      dataset.id,
      {
        text: 'Quanto custa o curso?',
        facts: [{ key: 'pain', value: 'vergonha de falar em público' }],
      },
      {
        intent: 'price_request',
        decision: 'reply',
        mustNotMatch: ['R\\$', '\\d+x'],
        validationOk: true,
      },
    )
    await service.addItem(
      ctx,
      dataset.id,
      { text: 'quero falar com um atendente humano' },
      { decision: 'handoff' },
    )
    await service.addItem(
      ctx,
      dataset.id,
      { text: 'Oi, tudo bem?' },
      { mustInclude: ['texto que nunca aparece'] },
    )

    const summary = await service.run(ctx, dataset.id, { unitId: env.seed.unitId })
    expect(summary.items).toBe(3)
    expect(summary.passed).toBe(2)
    expect(summary.passRate).toBeCloseTo(2 / 3)
    expect(summary.handoffs).toBe(1)
    const failed = summary.results.find((r) => !r.passed)!
    expect(failed.failures[0]).toMatch(/faltou/)
    // every run left a sandbox conversation with the agent reply persisted
    const conv = await env.db.conversation.findUnique({
      where: { id: summary.results[0]!.conversationId },
      include: { channel: true, messages: true },
    })
    expect(conv?.channel.kind).toBe('playground')
    expect(conv?.messages.some((m) => m.direction === 'outbound' && m.authorType === 'agent')).toBe(
      true,
    )
  })

  it('imports a real conversation turn and compares two configurations', async () => {
    const ctx = ctxOf()
    const phone = randomPhone()
    await inbound(env, phone, 'Tenho vergonha de falar em público')
    const res = await inbound(env, phone, 'Quanto custa?')
    const dataset = await service.create(ctx, { name: `Importado ${Date.now()}` })
    const item = await service.addFromConversation(ctx, dataset.id, res.conversationId!, {
      mustNotMatch: ['R\\$'],
    })
    expect(item.source).toBe(`conversation:${res.conversationId}`)
    const input = item.input as { text: string; history: string[]; facts: Array<{ key: string }> }
    expect(input.text).toBe('Quanto custa?')
    expect(input.history).toEqual(['Tenho vergonha de falar em público'])
    expect(input.facts.some((f) => f.key === 'pain')).toBe(true)

    const cmp = await service.compare(
      ctx,
      dataset.id,
      { unitId: env.seed.unitId },
      { unitId: env.seed.unitId, model: 'mock-alt' },
    )
    expect(cmp.a.items).toBe(1)
    expect(cmp.b.items).toBe(1)
    expect(['tie', 'A', 'B']).toContain(cmp.winner)
    expect(cmp.diffs[0]).toHaveProperty('changed')
    expect((await service.get(ctx, dataset.id)).items).toHaveLength(1)
    await service.removeItem(ctx, dataset.id, item.id)
    expect((await service.get(ctx, dataset.id)).items).toHaveLength(0)
    await service.remove(ctx, dataset.id)
    await expect(service.get(ctx, dataset.id)).rejects.toThrow()
  })
})
