import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, type Db } from '@vox/db'
import {
  KnowledgeIngestionService,
  NoopRealtimePublisher,
  createLogger,
  seedVox2you,
} from '@vox/core'
import { MockMessagingProvider } from '@vox/providers'
import { loadConfig } from './config.js'
import { createAppContext, type Queues } from './context.js'
import { buildApp, type App } from './app.js'

const RUN = process.env['RUN_INTEGRATION'] === '1' || !!process.env['DATABASE_URL']

describe.skipIf(!RUN)('API', () => {
  let app: App
  let db: Db
  let token = ''
  let unitId = ''
  let messaging: MockMessagingProvider
  const added: unknown[] = []

  beforeAll(async () => {
    process.env['LLM_PROVIDER'] = 'mock'
    process.env['MESSAGING_PROVIDER'] = 'mock'
    process.env['EMBEDDING_PROVIDER'] = 'hash'
    process.env['STORAGE_PROVIDER'] = 'local'
    process.env['STORAGE_LOCAL_DIR'] = '/tmp/vox-test-storage'
    process.env['INBOUND_INLINE'] = '1'
    process.env['WHATSAPP_VERIFY_TOKEN'] = 'verify-me'
    const config = loadConfig({
      ...process.env,
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-0123456789abcdef0123456789',
      APP_ENCRYPTION_KEY: 'test-key-0123456789abcdef',
      INBOUND_INLINE: '1',
      WHATSAPP_VERIFY_TOKEN: 'verify-me',
    })
    db = createDb({ log: ['error'] })
    const seed = await seedVox2you(db, {
      adminEmail: 'api-admin@test.local',
      adminPassword: 'test12345',
      tenantSlug: 'api-test',
      unitSlug: 'api-unit',
      channelExternalId: 'api-mock-phone',
    })
    unitId = seed.unitId
    const fakeQueue = {
      add: async (...args: unknown[]) => added.push(args),
      addBulk: async () => [],
      close: async () => undefined,
    } as unknown as Queues['inbound']
    const ctx = await createAppContext(config, {
      db,
      realtime: new NoopRealtimePublisher(),
      queues: {
        inbound: fakeQueue,
        outbound: fakeQueue,
        ingestion: fakeQueue,
        followups: fakeQueue,
        events: fakeQueue,
      },
    })
    messaging = ctx.providers.messaging as MockMessagingProvider
    const ingestion = new KnowledgeIngestionService(
      db,
      ctx.providers,
      createLogger('test', 'silent'),
    )
    for (const id of seed.knowledgeDocumentIds) {
      const doc = await db.knowledgeDocument.findUnique({
        where: { id },
        select: { ingestStatus: true },
      })
      if (doc?.ingestStatus !== 'ready') await ingestion.ingest(id)
    }
    app = await buildApp(ctx)
    await app.ready()
  })
  afterAll(async () => {
    await app?.close()
  })

  it('serves health and openapi', async () => {
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200)
    const spec = await app.inject({ method: 'GET', url: '/docs/json' })
    expect(spec.statusCode, spec.body).toBe(200)
    expect(spec.json().paths['/api/v1/conversations/']).toBeTruthy()
  })

  it('rejects unauthenticated access and logs in', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/conversations/' })).statusCode).toBe(
      401,
    )
    const bad = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'api-admin@test.local', password: 'wrong-password' },
    })
    expect(bad.statusCode, bad.body).toBe(401)
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'api-admin@test.local', password: 'test12345' },
    })
    expect(res.statusCode, res.body).toBe(200)
    token = res.json().accessToken
    expect(token).toBeTruthy()
    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(me.json().user.email).toBe('api-admin@test.local')
    const refreshed = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: res.json().refreshToken },
    })
    expect(refreshed.statusCode, refreshed.body).toBe(200)
    // reuse of rotated token is rejected
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/refresh',
          payload: { refreshToken: res.json().refreshToken },
        })
      ).statusCode,
    ).toBe(401)
  })

  it("serves the caller's notifications and marks them read", async () => {
    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${token}` },
    })
    const userId = me.json().user.id as string
    const tenantId = me.json().user.tenantId as string
    await db.notification.create({
      data: { tenantId, userId, kind: 'system', title: 'Bem-vindo ao CRM' },
    })
    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications/?unread=1',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(list.statusCode, list.body).toBe(200)
    expect(list.json().unread).toBeGreaterThanOrEqual(1)
    const first = list.json().items[0]
    expect(first.title).toBeTruthy()
    const read = await app.inject({
      method: 'POST',
      url: `/api/v1/notifications/${first.id}/read`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(read.statusCode, read.body).toBe(200)
    expect(read.json().updated).toBe(1)
    const all = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/read-all',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(all.statusCode, all.body).toBe(200)
    const after = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications/',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(after.json().unread).toBe(0)
  })

  it('lets settings:write users set the SLA of a stage and the kanban exposes it', async () => {
    const h = { authorization: `Bearer ${token}` }
    const pipelines = await app.inject({ method: 'GET', url: '/api/v1/pipelines', headers: h })
    expect(pipelines.statusCode, pipelines.body).toBe(200)
    const pipeline = pipelines.json().items[0]
    const stage =
      pipeline.stages.find((s: { kind: string }) => s.kind === 'open') ?? pipeline.stages[1]
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/v1/pipelines/${pipeline.id}/stages/${stage.id}`,
      headers: h,
      payload: { maxHoursInStage: 36 },
    })
    expect(patched.statusCode, patched.body).toBe(200)
    expect(patched.json().maxHoursInStage).toBe(36)
    const kanban = await app.inject({
      method: 'GET',
      url: `/api/v1/leads/kanban?unitId=${unitId}`,
      headers: h,
    })
    expect(kanban.statusCode, kanban.body).toBe(200)
    const col = kanban
      .json()
      .columns.find((c: { stage: { id: string } }) => c.stage.id === stage.id)
    expect(col.stage.maxHoursInStage).toBe(36)
    const invalid = await app.inject({
      method: 'PATCH',
      url: `/api/v1/pipelines/${pipeline.id}/stages/${stage.id}`,
      headers: h,
      payload: { maxHoursInStage: 0 },
    })
    expect(invalid.statusCode).toBe(400)
    const cleared = await app.inject({
      method: 'PATCH',
      url: `/api/v1/pipelines/${pipeline.id}/stages/${stage.id}`,
      headers: h,
      payload: { maxHoursInStage: null },
    })
    expect(cleared.json().maxHoursInStage).toBeNull()
  })

  it('verifies webhook challenge and rejects bad signatures', async () => {
    const ok = await app.inject({
      method: 'GET',
      url: '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345',
    })
    expect(ok.statusCode, ok.body).toBe(200)
    expect(ok.body).toBe('12345')
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1',
        })
      ).statusCode,
    ).toBe(403)
    const payload = JSON.stringify(
      MockMessagingProvider.inboundTextPayload({
        phoneNumberId: 'api-mock-phone',
        from: '5565911112222',
        text: 'oi',
      }),
    )
    const unsigned = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      payload,
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=bad' },
    })
    expect(unsigned.statusCode, unsigned.body).toBe(401)
  })

  it('accepts a signed webhook, processes inline, and exposes the conversation in the inbox', async () => {
    const from = `5565${Math.floor(900000000 + Math.random() * 99999999)}`
    const body = JSON.stringify(
      MockMessagingProvider.inboundTextPayload({
        phoneNumberId: 'api-mock-phone',
        from,
        name: 'Web Hook',
        text: 'Oi, quanto custa o curso?',
      }),
    )
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      payload: body,
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': messaging.sign(body) },
    })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json().received).toBe(1)
    // inline processing is fire-and-forget: poll the inbox
    let found: { id: string } | undefined
    for (let i = 0; i < 40 && !found; i++) {
      await new Promise((r) => setTimeout(r, 100))
      const list = await app.inject({
        method: 'GET',
        url: `/api/v1/conversations/?q=${from}`,
        headers: { authorization: `Bearer ${token}` },
      })
      const items = list.json().items as Array<{
        id: string
        lastMessagePreview: string
        contact: { name: string }
      }>
      found = items.find(
        (c) =>
          c.contact.name === 'Web Hook' &&
          c.lastMessagePreview &&
          !c.lastMessagePreview.startsWith('Oi,'),
      )
    }
    expect(found).toBeTruthy()
    // the AgentRun row is finalized after the send step: poll until the decision is recorded
    let items: Array<{ direction: string; agentRun?: { decision: string | null } | null }> = []
    for (let i = 0; i < 40; i++) {
      const messages = await app.inject({
        method: 'GET',
        url: `/api/v1/conversations/${found!.id}/messages`,
        headers: { authorization: `Bearer ${token}` },
      })
      items = messages.json().items
      if (items[1]?.agentRun?.decision) break
      await new Promise((r) => setTimeout(r, 100))
    }
    expect(items.map((m) => m.direction)).toEqual(['inbound', 'outbound'])
    expect(items[1]?.agentRun?.decision).toBe('reply')
  })

  it('supports human takeover, sending inside the window, and blocks free text outside it', async () => {
    const sim = await app.inject({
      method: 'POST',
      url: '/api/v1/simulate/inbound',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        phone: `5565${Math.floor(900000000 + Math.random() * 99999999)}`,
        name: 'Sim',
        text: 'tenho vergonha de falar',
      },
    })
    expect(sim.statusCode, sim.body).toBe(200)
    const conversationId = sim.json().conversationId as string
    const mode = await app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversationId}/mode`,
      headers: { authorization: `Bearer ${token}` },
      payload: { mode: 'human', reason: 'teste' },
    })
    expect(mode.json().conversation.mode).toBe('human')
    const send = await app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversationId}/messages`,
      headers: { authorization: `Bearer ${token}` },
      payload: { text: 'Oi, aqui é o consultor. Posso te ajudar?' },
    })
    expect(send.statusCode, send.body).toBe(200)
    expect(send.json().message.status).toBe('sent')
    await db.conversation.update({
      where: { id: conversationId },
      data: { lastInboundAt: new Date(Date.now() - 30 * 36e5) },
    })
    const closed = await app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversationId}/messages`,
      headers: { authorization: `Bearer ${token}` },
      payload: { text: 'fora da janela' },
    })
    expect(closed.statusCode, closed.body).toBe(422)
    expect(closed.json().error).toBe('session_window_closed')
    const tpl = await app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversationId}/messages`,
      headers: { authorization: `Bearer ${token}` },
      payload: { templateName: 'retomada_contato', templateVariables: ['Sim', 'oratória'] },
    })
    expect(tpl.statusCode, tpl.body).toBe(200)
    expect(tpl.json().message.type).toBe('template')
    const resume = await app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversationId}/mode`,
      headers: { authorization: `Bearer ${token}` },
      payload: { mode: 'ai' },
    })
    expect(resume.json().conversation.mode).toBe('ai')
    const copilot = await app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversationId}/copilot`,
      headers: { authorization: `Bearer ${token}` },
      payload: { mode: 'suggest' },
    })
    expect(copilot.statusCode, copilot.body).toBe(200)
    expect(copilot.json().suggestedReply).toBeTruthy()
  })

  it('exposes kanban, lead 360, products, knowledge search, prompts, analytics and playground', async () => {
    const h = { authorization: `Bearer ${token}` }
    const kanban = await app.inject({
      method: 'GET',
      url: `/api/v1/leads/kanban?unitId=${unitId}`,
      headers: h,
    })
    expect(kanban.statusCode, kanban.body).toBe(200)
    expect(kanban.json().columns.length).toBe(10)
    const leadId = (kanban.json().columns as Array<{ leads: Array<{ id: string }> }>).flatMap(
      (c) => c.leads,
    )[0]?.id
    expect(leadId).toBeTruthy()
    const lead = await app.inject({ method: 'GET', url: `/api/v1/leads/${leadId}`, headers: h })
    expect(lead.json().contact).toBeTruthy()
    expect(lead.json().pipeline.stages.length).toBe(10)
    const stage = await app.inject({
      method: 'POST',
      url: `/api/v1/leads/${leadId}/stage`,
      headers: h,
      payload: { stageKey: 'qualified', reason: 'manual' },
    })
    expect(stage.json().stage.key).toBe('qualified')
    const timeline = await app.inject({
      method: 'GET',
      url: `/api/v1/leads/${leadId}/timeline`,
      headers: h,
    })
    expect(timeline.json().items.length).toBeGreaterThan(0)

    const products = await app.inject({
      method: 'GET',
      url: `/api/v1/products/catalog?unitId=${unitId}`,
      headers: h,
    })
    expect(products.json().items.length).toBe(5)
    const search = await app.inject({
      method: 'POST',
      url: '/api/v1/knowledge/search',
      headers: h,
      payload: { unitId, query: 'posso repor aula' },
    })
    expect(search.json().hits.length).toBeGreaterThan(0)
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/knowledge/documents',
      headers: h,
      payload: {
        title: 'Endereço',
        category: 'general',
        sourceType: 'text',
        content:
          'A unidade fica na Avenida Historiador Rubens de Mendonça, 1000, Cuiabá. Estacionamento gratuito.',
        publish: true,
        inline: true,
      },
    })
    expect(created.statusCode, created.body).toBe(200)
    expect(created.json().ingestion.chunks).toBeGreaterThan(0)
    const search2 = await app.inject({
      method: 'POST',
      url: '/api/v1/knowledge/search',
      headers: h,
      payload: { unitId, query: 'onde fica a unidade estacionamento' },
    })
    expect(search2.json().hits[0].title).toBe('Endereço')

    const prompts = await app.inject({ method: 'GET', url: '/api/v1/prompts', headers: h })
    expect(prompts.json().items.length).toBe(8)
    const draft = await app.inject({
      method: 'POST',
      url: '/api/v1/prompts/conversation.system/versions',
      headers: h,
      payload: {
        content:
          'Você é {{agent_name}}. Responda em JSON {"reply":"...","actions":[],"usedSources":[],"confidence":0.9}',
        notes: 'teste',
      },
    })
    expect(draft.statusCode, draft.body).toBe(200)
    expect(draft.json().status).toBe('draft')
    const publish = await app.inject({
      method: 'POST',
      url: `/api/v1/prompts/versions/${draft.json().id}/status`,
      headers: h,
      payload: { status: 'production' },
    })
    expect(publish.json().status).toBe('production')
    const audit = await app.inject({
      method: 'GET',
      url: '/api/v1/audit?action=prompt',
      headers: h,
    })
    expect(audit.json().items.length).toBeGreaterThan(0)

    const dash = await app.inject({
      method: 'GET',
      url: `/api/v1/analytics/dashboard?unitId=${unitId}`,
      headers: h,
    })
    expect(dash.statusCode, dash.body).toBe(200)
    expect(dash.json().commercial.leads).toBeGreaterThan(0)
    expect(dash.json().ai.runs).toBeGreaterThan(0)

    const pg = await app.inject({
      method: 'POST',
      url: '/api/v1/playground/run',
      headers: h,
      payload: { unitId, text: 'quanto custa o master?' },
    })
    expect(pg.statusCode, pg.body).toBe(200)
    expect(pg.json().run.reply).toBeTruthy()
    expect(pg.json().runRow.toolCalls.length).toBeGreaterThan(0)
    const pg2 = await app.inject({
      method: 'POST',
      url: '/api/v1/playground/run',
      headers: h,
      payload: { unitId, text: 'e tem turma à noite?', conversationId: pg.json().conversationId },
    })
    expect(pg2.json().conversationId).toBe(pg.json().conversationId)
  })

  it('enforces RBAC for sellers and blocks api keys on UI endpoints', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'vendedor@vox2you.local', password: 'test12345', tenant: 'api-test' },
    })
    expect(login.statusCode, login.body).toBe(200)
    const seller = login.json().accessToken as string
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/prompts',
          headers: { authorization: `Bearer ${seller}` },
        })
      ).statusCode,
    ).toBe(403)
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/conversations/',
          headers: { authorization: `Bearer ${seller}` },
        })
      ).statusCode,
    ).toBe(200)
  })

  it('locks an account after repeated failures and clears the lock on success', async () => {
    // Own source address so the per-IP login rate limit does not interfere with the account lock
    const from = { remoteAddress: '10.9.9.9' }
    const login = (password: string) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'vendedor@vox2you.local', password, tenant: 'api-test' },
        ...from,
      })
    for (let i = 0; i < 5; i++) expect((await login('wrong-password')).statusCode).toBe(401)
    const locked = await login('test12345')
    expect(locked.statusCode).toBe(429)
    expect(locked.json().error).toBe('account_locked')
    await app.ctx.redis.del(
      'login:lock:vendedor@vox2you.local',
      'login:fail:vendedor@vox2you.local',
    )
    expect((await login('test12345')).statusCode).toBe(200)
  })

  it('lets a user change their own password only with the current one', async () => {
    const auth = { authorization: `Bearer ${token}` }
    const wrong = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/change-password',
      headers: auth,
      payload: { currentPassword: 'nope-nope', newPassword: 'brand-new-pass' },
    })
    expect(wrong.statusCode).toBe(401)
    const ok = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/change-password',
      headers: auth,
      payload: { currentPassword: 'test12345', newPassword: 'brand-new-pass' },
    })
    expect(ok.statusCode, ok.body).toBe(200)
    const oldLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'api-admin@test.local', password: 'test12345', tenant: 'api-test' },
    })
    expect(oldLogin.statusCode).toBe(401)
    const newLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'api-admin@test.local', password: 'brand-new-pass', tenant: 'api-test' },
    })
    expect(newLogin.statusCode, newLogin.body).toBe(200)
    // restore so other runs keep working against the same database
    const back = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/change-password',
      headers: { authorization: `Bearer ${newLogin.json().accessToken}` },
      payload: { currentPassword: 'brand-new-pass', newPassword: 'test12345' },
    })
    expect(back.statusCode).toBe(200)
  })
})
