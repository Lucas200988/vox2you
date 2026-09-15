import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, type Db } from '@vox/db'
import { NoopRealtimePublisher, runWithTenant, runWithTenantSync, seedVox2you } from '@vox/core'
import { loadConfig } from './config.js'
import { createAppContext, type AppContext, type Queues } from './context.js'
import { buildApp, type App } from './app.js'

const RUN = process.env['RUN_INTEGRATION'] === '1' || !!process.env['DATABASE_URL']

/**
 * A credential saved in Configurações → Integrações must actually replace the process-wide mock
 * provider for that tenant — in the resolver, in the ambient-tenant proxy, and inside a request.
 */
describe.skipIf(!RUN)('Tenant providers from CRM credentials', () => {
  let app: App
  let ctx: AppContext
  let db: Db
  let tenantId = ''
  let token = ''

  beforeAll(async () => {
    // the deployed server carries these from an earlier bootstrap, when no key existed yet
    process.env['LLM_PROVIDER'] = 'mock'
    process.env['EMBEDDING_PROVIDER'] = 'hash'
    process.env['MESSAGING_PROVIDER'] = 'mock'
    process.env['STORAGE_PROVIDER'] = 'local'
    process.env['STORAGE_LOCAL_DIR'] = '/tmp/vox-test-storage'
    delete process.env['ANTHROPIC_API_KEY']
    delete process.env['OPENAI_API_KEY'] // the fixture must not inherit a key from the developer's .env
    const config = loadConfig({
      ...process.env,
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-0123456789abcdef0123456789',
      APP_ENCRYPTION_KEY: 'test-key-0123456789abcdef',
    })
    db = createDb({ log: ['error'] })
    const seed = await seedVox2you(db, {
      adminEmail: 'providers-admin@test.local',
      adminPassword: 'test12345',
      tenantSlug: 'providers-test',
      unitSlug: 'providers-unit',
      channelExternalId: 'providers-mock-phone',
    })
    tenantId = seed.tenantId
    // the seed reuses an existing tenant, so drop credentials left by an earlier run
    await db.integration.deleteMany({ where: { tenantId } })
    const fakeQueue = {
      add: async () => undefined,
      addBulk: async () => [],
      close: async () => undefined,
    } as unknown as Queues['inbound']
    ctx = await createAppContext(config, {
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
    app = await buildApp(ctx)
    // a probe route that reports which provider the ambient tenant resolves to inside a request
    app.get('/__test/provider', { preHandler: app.requireAuth() }, async () => ({
      llm: ctx.providers.llm.name,
    }))
    await app.ready()
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'providers-admin@test.local', password: 'test12345' },
    })
    token = login.json().accessToken
  })
  afterAll(async () => {
    await app?.close()
  })

  it('starts on the mock provider while no credential is configured', async () => {
    expect(ctx.providerStatus.llm).toBe('mock')
    const resolved = await ctx.resolver.resolve(tenantId)
    expect(resolved.status.llm).toBe('mock')
  })

  it('switches the tenant to Anthropic as soon as the key is saved in the CRM', async () => {
    const saved = await app.inject({
      method: 'PUT',
      url: '/api/v1/integrations/anthropic',
      headers: { authorization: `Bearer ${token}` },
      payload: { values: { apiKey: 'sk-ant-test-key-not-used' } },
    })
    expect(saved.statusCode, saved.body).toBe(200)

    // 1. the resolver builds a real Anthropic provider for this tenant
    ctx.resolver.invalidate(tenantId)
    const resolved = await ctx.resolver.resolve(tenantId)
    expect(resolved.status.llm).toBe('anthropic')
    expect(resolved.providers.llm.name).toBe('anthropic')

    // 2. the ambient-tenant proxy serves it to anything running under that tenant
    await runWithTenant(tenantId, async () => {
      expect(ctx.providers.llm.name).toBe('anthropic')
    })
    // 3. …including callback-style scopes (how the API binds a request to its tenant)
    runWithTenantSync(tenantId, () => {
      expect(ctx.providers.llm.name).toBe('anthropic')
    })

    // 4. and the process-wide default stays on mock for anyone outside a tenant
    expect(ctx.providerStatus.llm).toBe('mock')
    expect(ctx.providers.llm.name).toBe('mock')
  })

  it('serves the tenant provider inside an authenticated request', async () => {
    // Injected from *another* tenant's scope on purpose: the request must be bound by the auth hook
    // itself, not by an ambient scope leaking from the caller. Without that binding the handler sees
    // the process-wide providers and the agent answers with the simulator.
    const res = await runWithTenantSync('11111111-1111-1111-1111-111111111111', () =>
      app.inject({
        method: 'GET',
        url: '/__test/provider',
        headers: { authorization: `Bearer ${token}` },
      }),
    )
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json().llm).toBe('anthropic')
  })
})
