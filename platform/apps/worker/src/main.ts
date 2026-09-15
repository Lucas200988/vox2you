import os from 'node:os'
import { Queue, Worker, type Job } from 'bullmq'
import { Redis } from 'ioredis'
import { createDb } from '@vox/db'
import {
  createLogger,
  currentTenantId,
  InboundProcessor,
  IntegrationService,
  PromptRegistry,
  QUEUES,
  type AgentDeps,
  type DomainEventJob,
  type FollowUpJob,
  type InboundJob,
  type IngestionJob,
  type OutboundJob,
} from '@vox/core'
import {
  createProvidersFromEnv,
  RedisRealtimePublisher,
  tenantAwareProviders,
  TenantProviderResolver,
} from '@vox/providers'
import { tenantOf, withTenant } from './tenant.js'
import { loadConfig } from './config.js'
import { processInbound } from './jobs/inbound.js'
import { processOutbound } from './jobs/outbound.js'
import { processIngestion } from './jobs/ingestion.js'
import { processFollowUp } from './jobs/followup.js'
import { processDomainEvent } from './jobs/events.js'
import { startSchedulers } from './scheduler.js'

async function main() {
  const config = loadConfig()
  const logger = createLogger('worker', config.LOG_LEVEL)
  const db = createDb({ url: config.DATABASE_URL })
  const baseEnv = process.env as Record<string, string | undefined>
  const built = createProvidersFromEnv(baseEnv, logger)
  const status = built.status
  if (status.pendingCredentials.length)
    logger.warn(
      { pending: status.pendingCredentials },
      'running with mock/local providers (tenants may configure their own in the CRM)',
    )
  // CRM-managed credentials: resolved per tenant and served through an ambient-tenant facade
  const integrations = new IntegrationService(db, config.APP_ENCRYPTION_KEY)
  const resolver = new TenantProviderResolver({
    baseEnv,
    base: built,
    logger,
    loadOverrides: (tenantId) => integrations.envOverrides(tenantId),
  })
  const providers = tenantAwareProviders(built.providers, resolver, currentTenantId)
  const prompts = new PromptRegistry(db)
  const deps: AgentDeps = {
    db,
    providers,
    logger,
    prompts,
    warmTenant: async (tenantId) => void (await resolver.resolve(tenantId)),
  }
  const realtime = new RedisRealtimePublisher(config.REDIS_URL)
  const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null })
  const queues = {
    inbound: new Queue(QUEUES.inbound, { connection }),
    outbound: new Queue(QUEUES.outbound, { connection }),
    ingestion: new Queue(QUEUES.ingestion, { connection }),
    followups: new Queue(QUEUES.followups, { connection }),
    events: new Queue(QUEUES.events, { connection }),
    dlq: new Queue('dead-letter', { connection }),
  }
  const inboundProcessor = new InboundProcessor(deps, realtime)
  const instanceId = `${os.hostname()}:${process.pid}`
  const ctx = {
    config,
    db,
    providers,
    logger,
    deps,
    realtime,
    queues,
    inboundProcessor,
    redis: connection,
    instanceId,
  }

  const deadLetter = (queueName: string) => async (job: Job | undefined, err: Error) => {
    if (!job) return
    logger.error(
      { queue: queueName, jobId: job.id, attempts: job.attemptsMade, err: err.message },
      'job failed',
    )
    if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await queues.dlq
        .add(
          queueName,
          {
            queue: queueName,
            name: job.name,
            data: job.data,
            error: err.message,
            failedAt: new Date().toISOString(),
          },
          { removeOnComplete: false },
        )
        .catch(() => undefined)
    }
  }

  const workers = [
    new Worker<InboundJob>(QUEUES.inbound, (job) => processInbound(ctx, job.data), {
      connection,
      concurrency: config.WORKER_CONCURRENCY_INBOUND,
    }),
    new Worker<OutboundJob>(
      QUEUES.outbound,
      (job) => withTenant(ctx, job.data.tenantId, () => processOutbound(ctx, job.data)),
      {
        connection,
        concurrency: 4,
      },
    ),
    new Worker<IngestionJob>(
      QUEUES.ingestion,
      async (job) =>
        withTenant(ctx, await tenantOf.document(ctx, job.data.documentId), () =>
          processIngestion(ctx, job.data),
        ),
      {
        connection,
        concurrency: config.WORKER_CONCURRENCY_INGESTION,
      },
    ),
    new Worker<FollowUpJob>(
      QUEUES.followups,
      async (job) =>
        withTenant(ctx, await tenantOf.followUp(ctx, job.data.followUpId), () =>
          processFollowUp(ctx, job.data),
        ),
      {
        connection,
        concurrency: 2,
      },
    ),
    new Worker<DomainEventJob>(
      QUEUES.events,
      async (job) =>
        withTenant(ctx, await tenantOf.event(ctx, job.data.eventId), () =>
          processDomainEvent(ctx, job.data),
        ),
      {
        connection,
        concurrency: 4,
      },
    ),
  ]
  for (const w of workers) {
    w.on('failed', deadLetter(w.name))
    w.on('error', (err) => logger.error({ err, queue: w.name }, 'worker error'))
  }
  const stopSchedulers = config.SCHEDULERS === '1' ? startSchedulers(ctx) : () => undefined
  logger.info(
    { providers: status, queues: Object.keys(queues), schedulers: config.SCHEDULERS === '1' },
    'worker ready',
  )

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'worker shutting down')
    stopSchedulers()
    await Promise.allSettled(workers.map((w) => w.close()))
    await Promise.allSettled([
      ...Object.values(queues).map((q) => q.close()),
      realtime.close(),
      connection.quit(),
      db.$disconnect(),
    ])
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

export type WorkerContext = {
  config: ReturnType<typeof loadConfig>
  db: ReturnType<typeof createDb>
  providers: AgentDeps['providers']
  logger: AgentDeps['logger']
  deps: AgentDeps
  realtime: RedisRealtimePublisher
  queues: {
    inbound: Queue
    outbound: Queue
    ingestion: Queue
    followups: Queue
    events: Queue
    dlq: Queue
  }
  inboundProcessor: InboundProcessor
  redis: Redis
  /** hostname:pid, identifies which replica holds a scheduler tick */
  instanceId: string
}
