import type { InboundJob } from '@vox/core'
import type { WorkerContext } from '../main.js'

/** Inbound webhook event → InboundProcessor. Idempotent through Message.providerMessageId + IdempotencyKey. */
export async function processInbound(ctx: WorkerContext, job: InboundJob) {
  const existing = await ctx.db.idempotencyKey.findUnique({ where: { key: job.key } })
  if (existing) return { skipped: 'duplicate' }
  const result = await ctx.inboundProcessor.process(job.event)
  await ctx.db.idempotencyKey.create({ data: { key: job.key, scope: 'inbound', result: { handled: result.handled, conversationId: result.conversationId ?? null, decision: result.run?.decision ?? null } } }).catch(() => undefined)
  return { handled: result.handled, decision: result.run?.decision ?? null, conversationId: result.conversationId ?? null }
}
