import { Queue } from 'bullmq'
import { Redis } from 'ioredis'
import { createDb, type Db } from '@vox/db'
import { createLogger, InboundProcessor, PromptRegistry, QUEUES, type AgentDeps, type Logger, type Providers, type RealtimePublisher } from '@vox/core'
import { createProvidersFromEnv, RedisRealtimePublisher, type ProviderStatus } from '@vox/providers'
import type { ApiConfig } from './config.js'

export interface Queues {
  inbound: Queue
  outbound: Queue
  ingestion: Queue
  followups: Queue
  events: Queue
}

export interface AppContext {
  config: ApiConfig
  db: Db
  logger: Logger
  providers: Providers
  providerStatus: ProviderStatus
  prompts: PromptRegistry
  deps: AgentDeps
  queues: Queues
  realtime: RealtimePublisher
  redis: Redis
  inbound: InboundProcessor
  close(): Promise<void>
}

const defaultJobOptions = { attempts: 5, backoff: { type: 'exponential' as const, delay: 2000 }, removeOnComplete: 1000, removeOnFail: 5000 }

export function createQueues(redisUrl: string): Queues {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null })
  const make = (name: string) => new Queue(name, { connection, defaultJobOptions })
  return { inbound: make(QUEUES.inbound), outbound: make(QUEUES.outbound), ingestion: make(QUEUES.ingestion), followups: make(QUEUES.followups), events: make(QUEUES.events) }
}

export async function createAppContext(config: ApiConfig, overrides: Partial<Pick<AppContext, 'db' | 'providers' | 'realtime' | 'queues'>> = {}): Promise<AppContext> {
  const logger = createLogger('api', config.LOG_LEVEL)
  const db = overrides.db ?? createDb({ url: config.DATABASE_URL })
  const built = createProvidersFromEnv(process.env as Record<string, string | undefined>, logger)
  const providers = overrides.providers ?? built.providers
  if (built.status.pendingCredentials.length) logger.warn({ pending: built.status.pendingCredentials }, 'running with mock/local providers for missing credentials')
  const prompts = new PromptRegistry(db)
  const deps: AgentDeps = { db, providers, logger, prompts }
  const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: true })
  const realtime = overrides.realtime ?? new RedisRealtimePublisher(config.REDIS_URL)
  const queues = overrides.queues ?? createQueues(config.REDIS_URL)
  const inbound = new InboundProcessor(deps, realtime)
  return {
    config,
    db,
    logger,
    providers,
    providerStatus: built.status,
    prompts,
    deps,
    queues,
    realtime,
    redis,
    inbound,
    async close() {
      await Promise.allSettled([...Object.values(queues).map((q) => q.close()), redis.quit(), (realtime as RedisRealtimePublisher).close?.(), db.$disconnect()])
    },
  }
}
