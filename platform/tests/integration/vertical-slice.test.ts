import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { KnowledgeSearchService, agentContext } from '@vox/core'
import { inbound, randomPhone, RUN, setupTestEnv, type TestEnv } from './helpers.js'

describe.skipIf(!RUN)('Vertical slice: WhatsApp inbound → CRM → agent → outbound', () => {
  let env: TestEnv
  beforeAll(async () => {
    env = await setupTestEnv()
  })
  afterAll(async () => {
    await env?.db.$disconnect()
  })

  it('creates contact, conversation, lead, stores message and replies with the agent', async () => {
    const phone = randomPhone()
    const before = env.messaging.sent.length
    const res = await inbound(env, phone, 'Oi, queria saber como funciona o curso', { name: 'Ana Souza' })
    expect(res.handled).toBe(true)
    expect(res.run?.decision).toBe('reply')
    expect(res.run?.reply).toBeTruthy()
    expect(env.messaging.sent.length).toBe(before + 1)
    expect(env.messaging.sent.at(-1)!.to).toBe(phone)

    const contact = await env.db.contact.findFirst({ where: { id: res.contactId }, include: { identities: true } })
    expect(contact?.name).toBe('Ana Souza')
    expect(contact?.phone).toBe(`+${phone}`)
    expect(contact?.identities[0]?.externalId).toBe(phone)

    const messages = await env.db.message.findMany({ where: { conversationId: res.conversationId }, orderBy: { createdAt: 'asc' } })
    expect(messages.map((m) => m.direction)).toEqual(['inbound', 'outbound'])
    expect(messages[1]?.status).toBe('sent')
    expect(messages[1]?.agentRunId).toBe(res.run?.runId)

    const run = await env.db.agentRun.findUnique({ where: { id: res.run!.runId }, include: { toolCalls: true } })
    expect(run?.status).toBe('completed')
    expect(run?.decision).toBe('reply')
    expect(run?.toolCalls.some((t) => t.name === 'get_catalog')).toBe(true)
    expect(run?.sourceIds.length).toBeGreaterThan(0) // knowledge retrieved for "como funciona"
    expect((run?.steps as Array<{ name: string }>).map((s) => s.name)).toContain('validate')

    const lead = await env.db.lead.findUnique({ where: { id: res.leadId }, include: { stage: true } })
    expect(lead?.stage.key).toBe('conversing')
    expect(lead?.nextFollowupAt).toBeTruthy()
  })

  it('is idempotent for duplicate provider message ids', async () => {
    const phone = randomPhone()
    const first = await inbound(env, phone, 'Oi')
    const messageId = (await env.db.message.findFirst({ where: { conversationId: first.conversationId, direction: 'inbound' } }))!.providerMessageId!
    const payload = { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: env.phoneNumberId }, messages: [{ id: messageId, from: phone, timestamp: '1700000000', type: 'text', text: { body: 'Oi' } }] } }] }] }
    const dup = await env.processor.process(env.messaging.parseInbound(payload)[0]!)
    expect(dup.duplicate).toBe(true)
    expect(await env.db.message.count({ where: { conversationId: first.conversationId, direction: 'inbound' } })).toBe(1)
  })

  it('extracts facts progressively, recommends product and advances stage/score', async () => {
    const phone = randomPhone()
    await inbound(env, phone, 'Oi, me chamo Carlos. Tenho muita vergonha de falar em público e preciso apresentar melhor minha empresa')
    const res = await inbound(env, phone, 'Quanto custa o curso? Prefiro à noite')
    const lead = await env.db.lead.findUnique({ where: { id: res.leadId }, include: { facts: true, stage: true, recommendedProduct: true, scoreSnapshots: true } })
    const keys = lead!.facts.filter((f) => f.status === 'active').map((f) => f.key)
    expect(keys).toEqual(expect.arrayContaining(['pain', 'goal', 'preferred_period', 'name']))
    expect(lead!.score).toBeGreaterThan(20)
    expect(lead!.scoreBreakdown).toBeTruthy()
    expect(['discovery', 'qualified', 'offer']).toContain(lead!.stage.key)
    expect(lead!.recommendedProduct).toBeTruthy()
    expect(lead!.nextBestAction).toBeTruthy()
    const contact = await env.db.contact.findUnique({ where: { id: res.contactId } })
    expect(contact?.name).toBeTruthy()
    // reply cites a real catalog price and passes validation
    expect(res.run?.validation?.ok).toBe(true)
    expect(res.run?.reply).toMatch(/R\$/)
    const history = await env.db.leadStageHistory.count({ where: { leadId: res.leadId } })
    expect(history).toBeGreaterThanOrEqual(2)
  })

  it('blocks a hallucinated price and falls back safely', async () => {
    const phone = randomPhone()
    env.llm.enqueue({ reply: 'O Academy custa R$ 999,00 à vista, últimas vagas!', actions: [], usedSources: [], confidence: 0.9 }, 'generate')
    env.llm.enqueue({ reply: 'Ainda R$ 999,00.', actions: [], usedSources: [], confidence: 0.9 }, 'generate')
    const res = await inbound(env, phone, 'quanto custa o academy?')
    expect(res.run?.decision).toBe('blocked')
    expect(res.run?.validation?.issues.some((i) => i.code === 'unsupported_price')).toBe(true)
    expect(res.run?.reply).not.toMatch(/999/)
    const tasks = await env.db.task.count({ where: { leadId: res.leadId } })
    expect(tasks).toBeGreaterThan(0)
    const blockedEvents = await env.db.domainEvent.count({ where: { type: 'agent.validation_blocked', aggregateId: res.conversationId } })
    expect(blockedEvents).toBe(1)
  })

  it('hands off to a human when the customer asks, pauses the AI and keeps context', async () => {
    const phone = randomPhone()
    await inbound(env, phone, 'Tenho vergonha de falar e quero melhorar', { name: 'Joana' })
    const res = await inbound(env, phone, 'quero falar com um atendente humano por favor')
    expect(res.run?.decision).toBe('handoff')
    const conv = await env.db.conversation.findUnique({ where: { id: res.conversationId } })
    expect(conv?.mode).toBe('human')
    expect(conv?.handoffSummary).toMatchObject({ reason: expect.any(String) })
    expect((conv?.handoffSummary as { facts: unknown[] }).facts.length).toBeGreaterThan(0)
    const events = await env.db.domainEvent.findMany({ where: { type: 'handoff.requested', aggregateId: res.conversationId } })
    expect(events.length).toBeGreaterThanOrEqual(1)
    // next message: agent stays silent (human mode)
    const sentBefore = env.messaging.sent.length
    const silent = await inbound(env, phone, 'alguém aí?')
    expect(silent.run?.decision).toBe('silent')
    expect(env.messaging.sent.length).toBe(sentBefore)
  })

  it('respects opt-out: records consent, cancels follow-ups and acknowledges', async () => {
    const phone = randomPhone()
    await inbound(env, phone, 'quanto custa?')
    const res = await inbound(env, phone, 'não me mande mais mensagens')
    expect(res.run?.decision).toBe('reply')
    expect(res.run?.decisionReason).toBe('opt_out')
    const consent = await env.db.consent.findUnique({ where: { contactId_purpose: { contactId: res.contactId!, purpose: 'marketing' } } })
    expect(consent?.status).toBe('opted_out')
    const scheduled = await env.db.followUp.count({ where: { leadId: res.leadId, status: 'scheduled' } })
    expect(scheduled).toBe(0)
  })

  it('schedules a follow-up honoring "me chama mês que vem"', async () => {
    const phone = randomPhone()
    const res = await inbound(env, phone, 'gostei mas vou pensar, me chama mês que vem')
    const fu = await env.db.followUp.findFirst({ where: { leadId: res.leadId, status: 'scheduled' } })
    expect(fu).toBeTruthy()
    expect(fu!.scheduledAt.getTime()).toBeGreaterThan(Date.now() + 10 * 864e5)
  })

  it('handles B2B inquiry and complaint escalation', async () => {
    const b2b = await inbound(env, randomPhone(), 'Quero treinar minha equipe comercial, somos 50 pessoas na empresa')
    expect(b2b.run?.decision).toBe('handoff')
    expect(b2b.run?.handoffReason).toMatch(/B2B/i)
    const lead = await env.db.lead.findUnique({ where: { id: b2b.leadId } })
    expect(lead?.profileType).toBe('b2b')
    const angry = await inbound(env, randomPhone(), 'isso é um absurdo, ninguém responde, péssimo atendimento')
    expect(angry.run?.decision).toBe('handoff')
  })

  it('transcribes audio and uses the transcript as the message', async () => {
    const phone = randomPhone()
    const payload = { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: env.phoneNumberId }, contacts: [{ wa_id: phone, profile: { name: 'Audio' } }], messages: [{ id: `wamid.audio.${phone}`, from: phone, timestamp: String(Math.floor(Date.now() / 1000)), type: 'audio', audio: { id: 'media-xyz', mime_type: 'audio/ogg' } }] } }] }] }
    const res = await env.processor.process(env.messaging.parseInbound(payload)[0]!)
    const msg = await env.db.message.findUnique({ where: { id: res.messageId }, include: { attachments: true } })
    expect(msg?.type).toBe('audio')
    expect(msg?.transcript).toBeTruthy()
    expect(msg?.attachments[0]?.storageKey).toBeTruthy()
    expect(res.run?.decision).toBe('reply')
  })

  it('records attribution from click-to-whatsapp referral', async () => {
    const res = await inbound(env, randomPhone(), 'vi o anúncio', { referral: { source_url: 'https://fb.com/ads/1', ctwa_clid: 'clid-123', headline: 'Curso de Oratória', source_id: 'ad-9' } })
    const attribution = await env.db.attribution.findFirst({ where: { contactId: res.contactId } })
    expect(attribution?.ctwaClid).toBe('clid-123')
    const contact = await env.db.contact.findUnique({ where: { id: res.contactId } })
    expect(contact?.source).toBe('click_to_whatsapp')
  })

  it('hybrid knowledge search returns published chunks with scores', async () => {
    const search = new KnowledgeSearchService(env.db, env.providers.embedding)
    const hits = await search.search({ tenantId: env.seed.tenantId, unitId: env.seed.unitId, query: 'quantos alunos por turma', limit: 3 })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]!.content.toLowerCase()).toContain('turma')
    expect(hits[0]!.score).toBeGreaterThan(0)
  })

  it('isolates tenants: another tenant cannot see leads, knowledge or catalog', async () => {
    const other = await env.db.tenant.create({ data: { name: 'Other', slug: `other-${Date.now()}` } })
    const ctxOther = agentContext(other.id)
    const search = new KnowledgeSearchService(env.db, env.providers.embedding)
    expect(await search.search({ tenantId: other.id, query: 'quantos alunos por turma' })).toEqual([])
    const { ProductService, LeadService } = await import('@vox/core')
    expect(await new ProductService(env.db).list(ctxOther)).toEqual([])
    expect(await new LeadService(env.db).list(ctxOther, {})).toEqual([])
    const someLead = await env.db.lead.findFirst({ where: { tenantId: env.seed.tenantId } })
    await expect(new LeadService(env.db).get(ctxOther, someLead!.id)).rejects.toThrow(/not found/)
  })
})
