import { PromptImprovementService, buildInsights, systemContext } from '@vox/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inbound, randomPhone, RUN, setSalesMode, setupTestEnv, type TestEnv } from './helpers.js'

describe.skipIf(!RUN)('Prompt improvement with human approval + insights', () => {
  let env: TestEnv
  beforeAll(async () => {
    env = await setupTestEnv()
    await setSalesMode(env, 'sdr')
  })
  afterAll(async () => {
    await env?.db.$disconnect()
  })

  it('collects evidence from blocked replies and handoffs and saves a DRAFT, never production', async () => {
    const ctx = systemContext(env.seed.tenantId, 'user:test')
    ctx.userId = env.seed.adminUserId
    const service = new PromptImprovementService(env.deps)
    // evidence: a blocked reply (price hallucination in SDR) and a handoff
    const p1 = randomPhone()
    env.llm.enqueue(
      { reply: 'Custa R$ 3.990,00.', actions: [], usedSources: [], confidence: 0.9 },
      'generate',
    )
    env.llm.enqueue(
      { reply: 'São R$ 3.990,00.', actions: [], usedSources: [], confidence: 0.9 },
      'generate',
    )
    const blocked = await inbound(env, p1, 'quanto custa?')
    expect(blocked.run?.decision).toBe('blocked')
    const p2 = randomPhone()
    await inbound(env, p2, 'quero falar com um atendente humano')

    const evidence = await service.collectEvidence(ctx, { days: 1 })
    expect(evidence.blockedRuns.length).toBeGreaterThanOrEqual(1)
    expect(evidence.handoffs.length).toBeGreaterThanOrEqual(1)

    const before = await env.db.promptVersion.count({
      where: { prompt: { key: 'conversation.system', tenantId: env.seed.tenantId } },
    })
    const result = await service.suggest(ctx, 'conversation.system', { days: 1 })
    expect(result.draft.status).toBe('draft')
    expect(result.changes.length).toBeGreaterThan(0)
    expect(result.draft.notes).toContain('Diagnóstico')
    expect(result.draft.content).toContain('revisão sugerida')
    // all variables of the production prompt survived
    const production = await env.deps.prompts.resolve(
      env.seed.tenantId,
      'conversation.system',
      'production',
    )
    for (const v of new Set(
      [...production.content.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]!),
    ))
      expect(result.draft.content).toContain(`{{${v}}}`)
    expect(
      await env.db.promptVersion.count({
        where: { prompt: { key: 'conversation.system', tenantId: env.seed.tenantId } },
      }),
    ).toBe(before + 1)
    // production untouched
    const prodAfter = await env.deps.prompts.resolve(
      env.seed.tenantId,
      'conversation.system',
      'production',
    )
    expect(prodAfter.version).toBe(production.version)
  })

  it('builds only the insights that stand out', () => {
    const none = buildInsights({
      leads: 3,
      won: 0,
      lost: 0,
      bySource: [],
      byProduct: [],
      lostReasons: [],
      abandonmentRate: 0.1,
      noShow: { completed: 1, no_show: 0 },
      followUpReplies: { sent: 2, replied: 1 },
      visitBookingRate: 0.3,
      blocked: 0,
      runs: 5,
      handoffRate: 0,
      overdueSla: 0,
      firstResponseSec: 20,
    })
    expect(none).toEqual([])
    const many = buildInsights({
      leads: 50,
      won: 5,
      lost: 20,
      bySource: [{ source: 'instagram', count: 40 }],
      byProduct: [
        { product: 'Academy', leads: 10, won: 3 },
        { product: 'Master', leads: 40, won: 2 },
      ],
      lostReasons: [{ reason: 'Preço', count: 12 }],
      abandonmentRate: 0.5,
      noShow: { completed: 4, no_show: 4 },
      followUpReplies: { sent: 20, replied: 8 },
      visitBookingRate: 0.1,
      blocked: 5,
      runs: 40,
      handoffRate: 0.35,
      overdueSla: 7,
      firstResponseSec: 900,
    })
    const kinds = many.map((i) => i.kind)
    expect(many.length).toBeLessThanOrEqual(6)
    expect(kinds).toContain('product_converts')
    expect(kinds).toContain('low_booking')
    expect(many.find((i) => i.kind === 'product_converts')?.text).toMatch(/Academy.*3\.0x/)
  })
})
