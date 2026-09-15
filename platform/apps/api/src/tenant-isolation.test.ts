import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, type Db } from '@vox/db'
import {
  InboundProcessor,
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

type Seed = Awaited<ReturnType<typeof seedVox2you>>

/**
 * Two tenants on the same API: everything tenant A owns (inbox, leads, contacts, knowledge,
 * catalog, units) must be invisible to tenant B's users — by id, by search and by unit filter.
 */
describe.skipIf(!RUN)('Tenant isolation over the API', () => {
  let app: App
  let db: Db
  let a: Seed
  let b: Seed
  let tokenB = ''
  const A_PHONE = '5565988880001'
  let aConversationId = ''
  let aLeadId = ''
  let aContactId = ''

  const asB = (method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>) =>
    app.inject({
      method,
      url,
      ...(payload ? { payload } : {}),
      headers: { authorization: `Bearer ${tokenB}` },
    })

  beforeAll(async () => {
    process.env['LLM_PROVIDER'] = 'mock'
    process.env['MESSAGING_PROVIDER'] = 'mock'
    process.env['EMBEDDING_PROVIDER'] = 'hash'
    process.env['STORAGE_PROVIDER'] = 'local'
    process.env['STORAGE_LOCAL_DIR'] = '/tmp/vox-test-storage'
    const config = loadConfig({
      ...process.env,
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-0123456789abcdef0123456789',
      APP_ENCRYPTION_KEY: 'test-key-0123456789abcdef',
    })
    db = createDb({ log: ['error'] })
    a = await seedVox2you(db, {
      adminEmail: 'iso-a@test.local',
      adminPassword: 'test12345',
      tenantSlug: 'iso-a',
      unitSlug: 'iso-a-unit',
      channelExternalId: 'iso-a-phone',
    })
    b = await seedVox2you(db, {
      adminEmail: 'iso-b@test.local',
      adminPassword: 'test12345',
      tenantSlug: 'iso-b',
      unitSlug: 'iso-b-unit',
      channelExternalId: 'iso-b-phone',
    })
    const fakeQueue = {
      add: async () => undefined,
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
    const logger = createLogger('test', 'silent')
    const ingestion = new KnowledgeIngestionService(db, ctx.providers, logger)
    for (const id of [...a.knowledgeDocumentIds, ...b.knowledgeDocumentIds]) {
      const doc = await db.knowledgeDocument.findUnique({
        where: { id },
        select: { ingestStatus: true },
      })
      if (doc?.ingestStatus !== 'ready') await ingestion.ingest(id)
    }
    // Tenant A gets a real conversation/lead/contact through the inbound pipeline
    const processor = new InboundProcessor(
      { db, providers: ctx.providers, logger, prompts: ctx.prompts },
      new NoopRealtimePublisher(),
    )
    const messaging = ctx.providers.messaging as MockMessagingProvider
    const payload = MockMessagingProvider.inboundTextPayload({
      phoneNumberId: 'iso-a-phone',
      from: A_PHONE,
      name: 'Isolada Silva',
      text: 'Oi, quero saber sobre o curso de oratória',
    })
    const res = await processor.process(messaging.parseInbound(payload)[0]!)
    aConversationId = res.conversationId!
    aLeadId = res.leadId!
    aContactId = res.contactId!

    app = await buildApp(ctx)
    await app.ready()
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'iso-b@test.local', password: 'test12345' },
    })
    expect(login.statusCode, login.body).toBe(200)
    tokenB = login.json().accessToken
  })
  afterAll(async () => {
    await app?.close()
  })

  it('inbox: tenant B never lists or opens tenant A conversations', async () => {
    const list = await asB('GET', '/api/v1/conversations/')
    expect(list.statusCode, list.body).toBe(200)
    const ids = (list.json().items as Array<{ id: string }>).map((c) => c.id)
    expect(ids).not.toContain(aConversationId)
    expect([403, 404]).toContain(
      (await asB('GET', `/api/v1/conversations/${aConversationId}`)).statusCode,
    )
    expect([403, 404]).toContain(
      (await asB('GET', `/api/v1/conversations/${aConversationId}/messages`)).statusCode,
    )
    expect([403, 404]).toContain(
      (await asB('POST', `/api/v1/conversations/${aConversationId}/messages`, { text: 'oi' }))
        .statusCode,
    )
  })

  it('crm: leads and contacts of tenant A are invisible by id, search and unit filter', async () => {
    expect([403, 404]).toContain((await asB('GET', `/api/v1/leads/${aLeadId}`)).statusCode)
    expect([403, 404]).toContain((await asB('GET', `/api/v1/leads/${aLeadId}/timeline`)).statusCode)
    expect([403, 404]).toContain(
      (await asB('POST', `/api/v1/leads/${aLeadId}/assign`, { ownerId: null })).statusCode,
    )
    const search = await asB('GET', '/api/v1/leads?q=Isolada')
    expect(search.statusCode, search.body).toBe(200)
    expect((search.json().items as Array<{ id: string }>).map((l) => l.id)).not.toContain(aLeadId)
    const kanban = await asB('GET', `/api/v1/leads/kanban?unitId=${a.unitId}`)
    expect([400, 403, 404]).toContain(kanban.statusCode)
    const byUnit = await asB('GET', `/api/v1/leads?unitId=${a.unitId}`)
    if (byUnit.statusCode === 200) expect(byUnit.json().items).toEqual([])
    else expect([400, 403]).toContain(byUnit.statusCode)

    expect([403, 404]).toContain((await asB('GET', `/api/v1/contacts/${aContactId}`)).statusCode)
    expect([403, 404]).toContain(
      (await asB('GET', `/api/v1/contacts/${aContactId}/export`)).statusCode,
    )
    const contacts = await asB('GET', `/api/v1/contacts/?q=${A_PHONE.slice(-8)}`)
    expect(contacts.statusCode, contacts.body).toBe(200)
    expect((contacts.json().items as Array<{ id: string }>).map((c) => c.id)).not.toContain(
      aContactId,
    )
  })

  it('knowledge: search returns only tenant B chunks and A documents are unreachable', async () => {
    const res = await asB('POST', '/api/v1/knowledge/search', {
      query: 'curso oratória preço',
      limit: 20,
    })
    expect(res.statusCode, res.body).toBe(200)
    const hits = res.json().hits as Array<{ chunkId?: string }>
    expect(Array.isArray(hits)).toBe(true)
    expect(hits.length).toBeGreaterThan(0)
    const chunkIds = hits.map((h) => h.chunkId).filter((x): x is string => !!x)
    const chunks = await db.knowledgeChunk.findMany({
      where: { id: { in: chunkIds } },
      select: { tenantId: true },
    })
    expect(chunks.length).toBe(chunkIds.length)
    expect(chunks.every((c) => c.tenantId === b.tenantId)).toBe(true)
    for (const id of a.knowledgeDocumentIds) {
      expect([403, 404]).toContain(
        (await asB('GET', `/api/v1/knowledge/documents/${id}`)).statusCode,
      )
    }
    const docs = await asB('GET', '/api/v1/knowledge/documents')
    expect(docs.statusCode, docs.body).toBe(200)
    const ids = (docs.json().items as Array<{ id: string }>).map((d) => d.id)
    for (const id of a.knowledgeDocumentIds) expect(ids).not.toContain(id)
  })

  it('catalog: tenant A products and unit catalog are unreachable', async () => {
    for (const id of Object.values(a.productIds)) {
      expect([403, 404]).toContain((await asB('GET', `/api/v1/products/${id}`)).statusCode)
    }
    const list = await asB('GET', '/api/v1/products/')
    expect(list.statusCode, list.body).toBe(200)
    const ids = (list.json().items as Array<{ id: string }>).map((p) => p.id)
    for (const id of Object.values(a.productIds)) expect(ids).not.toContain(id)
    const catalog = await asB('GET', `/api/v1/products/catalog?unitId=${a.unitId}`)
    expect([400, 403, 404]).toContain(catalog.statusCode)
  })
})
