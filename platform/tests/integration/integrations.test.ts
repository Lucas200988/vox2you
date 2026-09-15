import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { IntegrationService } from '@vox/core'
import { createProvidersFromEnv, TenantProviderResolver } from '@vox/providers'
import { RUN, setupTestEnv, type TestEnv } from './helpers.js'

/**
 * CRM-managed credentials: stored encrypted, shown masked, mapped onto provider env, and the
 * per-tenant resolver builds real provider instances from them (no network calls are made here).
 */
describe.skipIf(!RUN)('integrations (CRM-managed credentials)', () => {
  let env: TestEnv
  let service: IntegrationService
  const key = 'test-encryption-key-please-rotate'
  const phoneNumberId = `pn-${Date.now()}`

  beforeAll(async () => {
    env = await setupTestEnv()
    service = new IntegrationService(env.db, key)
  })
  afterAll(async () => {
    await env.db.integration.deleteMany({ where: { tenantId: env.seed.tenantId } })
    await env.db.channel.deleteMany({ where: { kind: 'whatsapp', externalId: phoneNumberId } })
    await env?.db.$disconnect()
  })

  it('stores secrets encrypted, returns them masked and keeps them when re-saved blank', async () => {
    const view = await service.save(env.seed.tenantId, 'anthropic', null, {
      apiKey: 'sk-ant-secret-1234',
      modelSmart: 'claude-sonnet-5',
    })
    expect(view.status).toBe('configured')
    expect(view.config).toEqual({ modelSmart: 'claude-sonnet-5' })
    expect(view.secrets['apiKey']).toEqual({ set: true, hint: '••••1234' })
    const row = await env.db.integration.findFirst({
      where: { tenantId: env.seed.tenantId, kind: 'anthropic' },
    })
    expect(row?.credentialsEnc).toBeTruthy()
    expect(row?.credentialsEnc).not.toContain('sk-ant')
    expect(JSON.stringify(row?.config)).not.toContain('sk-ant')

    // Blank secret on re-save = keep; non-secret can be changed
    const again = await service.save(env.seed.tenantId, 'anthropic', null, {
      apiKey: '',
      modelSmart: 'claude-opus-5',
    })
    expect(again.secrets['apiKey']?.hint).toBe('••••1234')
    const loaded = await service.values(env.seed.tenantId, 'anthropic', null)
    expect(loaded?.values).toEqual({ apiKey: 'sk-ant-secret-1234', modelSmart: 'claude-opus-5' })
  })

  it('rejects missing required fields and unit-scoped kinds without a unit', async () => {
    await expect(service.save(env.seed.tenantId, 'openai', null, {})).rejects.toThrow(/obrigat/i)
    await expect(
      service.save(env.seed.tenantId, 'whatsapp_meta', null, {
        phoneNumberId: 'x',
        accessToken: 'y',
        appSecret: 'z',
        verifyToken: 'v',
      }),
    ).rejects.toThrow(/unidade/i)
    await expect(service.save(env.seed.tenantId, 'nope', null, {})).rejects.toThrow()
  })

  it('creates the WhatsApp channel for the unit and refuses a number owned by another tenant', async () => {
    await service.save(env.seed.tenantId, 'whatsapp_meta', env.seed.unitId, {
      phoneNumberId,
      accessToken: 'EAAB-token',
      appSecret: 'app-secret',
      verifyToken: 'verify-me',
    })
    const channel = await env.db.channel.findUnique({
      where: { kind_externalId: { kind: 'whatsapp', externalId: phoneNumberId } },
    })
    expect(channel).toMatchObject({
      tenantId: env.seed.tenantId,
      unitId: env.seed.unitId,
      provider: 'meta',
      status: 'active',
    })
    expect(await service.matchesAnyWhatsAppVerifyToken('verify-me')).toBe(true)
    expect(await service.matchesAnyWhatsAppVerifyToken('wrong')).toBe(false)

    const other = await env.db.tenant.upsert({
      where: { slug: 'integrations-other' },
      update: {},
      create: { name: 'Other', slug: 'integrations-other' },
    })
    const otherUnit = await env.db.unit.upsert({
      where: { tenantId_slug: { tenantId: other.id, slug: 'u' } },
      update: {},
      create: { tenantId: other.id, name: 'U', slug: 'u', timezone: 'America/Cuiaba' },
    })
    await expect(
      service.save(other.id, 'whatsapp_meta', otherUnit.id, {
        phoneNumberId,
        accessToken: 'a',
        appSecret: 'b',
        verifyToken: 'c',
      }),
    ).rejects.toThrow(/outra conta/)
    await env.db.tenant.delete({ where: { id: other.id } })
  })

  it('maps stored values onto provider env and the resolver builds tenant providers from them', async () => {
    const overrides = await service.envOverrides(env.seed.tenantId)
    expect(overrides).toMatchObject({
      LLM_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'sk-ant-secret-1234',
      LLM_MODEL_SMART: 'claude-opus-5',
      MESSAGING_PROVIDER: 'meta',
      WHATSAPP_PHONE_NUMBER_ID: phoneNumberId,
      WHATSAPP_APP_SECRET: 'app-secret',
    })

    const baseEnv = {
      LLM_PROVIDER: 'mock',
      MESSAGING_PROVIDER: 'mock',
      EMBEDDING_PROVIDER: 'hash',
      STT_PROVIDER: 'mock',
      CALENDAR_PROVIDER: 'internal',
      STORAGE_PROVIDER: 'local',
      STORAGE_LOCAL_DIR: '/tmp/vox-test-storage',
      TRACE_SINK: 'console',
    }
    const base = createProvidersFromEnv(baseEnv)
    const resolver = new TenantProviderResolver({
      baseEnv,
      base,
      loadOverrides: (t) => service.envOverrides(t),
      ttlMs: 60_000,
    })
    const resolved = await resolver.resolve(env.seed.tenantId)
    expect(resolved.status.llm).toBe('anthropic')
    expect(resolved.status.messaging).toBe('meta')
    expect(resolved.providers.messaging.name).not.toBe(base.providers.messaging.name)
    // Signature validation now uses the tenant's app secret
    expect(
      resolved.providers.messaging.validateSignature(Buffer.from('{}'), 'sha256=deadbeef'),
    ).toBe(false)

    // Unknown tenant → process providers
    const none = await resolver.resolve('00000000-0000-4000-8000-000000000000')
    expect(none.status.llm).toBe('mock')

    // Invalidate → rebuilt after removal
    await service.remove(env.seed.tenantId, 'anthropic', null)
    resolver.invalidate(env.seed.tenantId)
    expect((await resolver.resolve(env.seed.tenantId)).status.llm).toBe('mock')
  })
})
