import { Queue, Worker, type Job } from 'bullmq'
import { Redis } from 'ioredis'
import { createDb } from '@vox/db'
import { createLogger, InboundProcessor, PromptRegistry, QUEUES, type AgentDeps, type DomainEventJob, type FollowUpJob, type InboundJob, type IngestionJob, type OutboundJob } from '@vox/core'
import { createProvidersFromEnv, RedisRealtimePublisher } from '@vox/providers'
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
  const { providers, status } = createProvidersFromEnv(process.env as Record<string, string | undefined>, logger)
  if (status.pendingCredentials.length) logger.warn({ pending: status.pendingCredentials }, 'running with mock/local providers')
  const prompts = new PromptRegistry(db)
  const deps: AgentDeps = { db, providers, logger, prompts }
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
  const ctx = { config, db, providers, logger, deps, realtime, queues, inboundProcessor }

  const deadLetter = (queueName: string) => async (job: Job | undefined, err: Error) => {
    if (!job) return
    logger.error({ queue: queueName, jobId: job.id, attempts: job.attemptsMade, err: err.message }, 'job failed')
    if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await queues.dlq.add(queueName, { queue: queueName, name: job.name, data: job.data, error: err.message, failedAt: new Date().toISOString() }, { removeOnComplete: false }).catch(() => undefined)
    }
  }

  const workers = [
    new Worker<InboundJob>(QUEUES.inbound, (job) => processInbound(ctx, job.data), { connection, concurrency: config.WORKER_CONCURRENCY_INBOUND }),
    new Worker<OutboundJob>(QUEUES.outbound, (job) => processOutbound(ctx, job.data), { connection, concurrency: 4 }),
    new Worker<IngestionJob>(QUEUES.ingestion, (job) => processIngestion(ctx, job.data), { connection, concurrency: config.WORKER_CONCURRENCY_INGESTION }),
    new Worker<FollowUpJob>(QUEUES.followups, (job) => processFollowUp(ctx, job.data), { connection, concurrency: 2 }),
    new Worker<DomainEventJob>(QUEUES.events, (job) => processDomainEvent(ctx, job.data), { connection, concurrency: 4 }),
  ]
  for (const w of workers) {
    w.on('failed', deadLetter(w.name))
    w.on('error', (err) => logger.error({ err, queue: w.name }, 'worker error'))
  }
  const stopSchedulers = startSchedulers(ctx)
  logger.info({ providers: status, queues: Object.keys(queues) }, 'worker ready')

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'worker shutting down')
    stopSchedulers()
    await Promise.allSettled(workers.map((w) => w.close()))
    await Promise.allSettled([...Object.values(queues).map((q) => q.close()), realtime.close(), connection.quit(), db.$disconnect()])
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
  queues: { inbound: Queue; outbound: Queue; ingestion: Queue; followups: Queue; events: Queue; dlq: Queue }
  inboundProcessor: InboundProcessor
}
