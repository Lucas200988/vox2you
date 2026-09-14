import { createDb, type Db } from '@vox/db'
import { createLogger, InboundProcessor, KnowledgeIngestionService, NoopRealtimePublisher, PromptRegistry, seedVox2you, type AgentDeps, type Providers } from '@vox/core'
import { createProvidersFromEnv, MockMessagingProvider, type MockLLMProvider } from '@vox/providers'

export interface TestEnv {
  db: Db
  providers: Providers
  llm: MockLLMProvider
  messaging: MockMessagingProvider
  deps: AgentDeps
  realtime: NoopRealtimePublisher
  processor: InboundProcessor
  seed: Awaited<ReturnType<typeof seedVox2you>>
  phoneNumberId: string
}

export const RUN = process.env['RUN_INTEGRATION'] === '1' || !!process.env['DATABASE_URL']

export async function setupTestEnv(): Promise<TestEnv> {
  const db = createDb({ log: ['error'] })
  const logger = createLogger('test', 'silent')
  const { providers } = createProvidersFromEnv({ LLM_PROVIDER: 'mock', EMBEDDING_PROVIDER: 'hash', MESSAGING_PROVIDER: 'mock', STT_PROVIDER: 'mock', CALENDAR_PROVIDER: 'internal', STORAGE_PROVIDER: 'local', STORAGE_LOCAL_DIR: '/tmp/vox-test-storage', TRACE_SINK: 'console' }, logger)
  const llm = providers.llm as MockLLMProvider
  const messaging = providers.messaging as MockMessagingProvider
  const seed = await seedVox2you(db, { adminEmail: 'admin@test.local', adminPassword: 'test12345', tenantSlug: 'test-tenant', unitSlug: 'test-unit', channelExternalId: 'mock-phone' })
  const ingestion = new KnowledgeIngestionService(db, providers, logger)
  for (const id of seed.knowledgeDocumentIds) {
    const doc = await db.knowledgeDocument.findUnique({ where: { id }, select: { ingestStatus: true } })
    if (doc?.ingestStatus !== 'ready') await ingestion.ingest(id)
  }
  const prompts = new PromptRegistry(db, 0)
  const deps: AgentDeps = { db, providers, logger, prompts }
  const realtime = new NoopRealtimePublisher()
  return { db, providers, llm, messaging, deps, realtime, processor: new InboundProcessor(deps, realtime), seed, phoneNumberId: 'mock-phone' }
}

export async function inbound(env: TestEnv, from: string, text: string, opts: { name?: string; referral?: Record<string, string> } = {}) {
  const payload = MockMessagingProvider.inboundTextPayload({ phoneNumberId: env.phoneNumberId, from, name: opts.name, text, referral: opts.referral })
  const events = env.messaging.parseInbound(payload)
  return env.processor.process(events[0]!)
}

export function randomPhone(): string {
  return `5565${Math.floor(900000000 + Math.random() * 99999999)}`
}
