import 'dotenv/config'
import { z } from 'zod'

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  /** Same key as the API: decrypts CRM-managed integration credentials. */
  APP_ENCRYPTION_KEY: z.string().min(16),
  WORKER_CONCURRENCY_INBOUND: z.coerce.number().default(8),
  WORKER_CONCURRENCY_INGESTION: z.coerce.number().default(2),
  OUTBOX_POLL_MS: z.coerce.number().default(2000),
  FOLLOWUP_POLL_MS: z.coerce.number().default(30000),
  WEBHOOK_TIMEOUT_MS: z.coerce.number().default(10000),
  /** In-process schedulers (outbox, follow-ups, SLA, cleanup). Run them in exactly ONE replica. */
  SCHEDULERS: z.enum(['0', '1']).default('1'),
})

export type WorkerConfig = z.infer<typeof EnvSchema>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const parsed = EnvSchema.safeParse(env)
  if (!parsed.success)
    throw new Error(
      `Invalid environment: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    )
  return parsed.data
}
