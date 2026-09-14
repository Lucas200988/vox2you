import { claimUnpublishedEvents, FollowUpService, KnowledgeIngestionService } from '@vox/core'
import type { WorkerContext } from './main.js'

/**
 * Lightweight in-process schedulers (single worker instance is enough for one unit; for horizontal
 * scale switch to BullMQ repeatable jobs with a lock — see docs/DEPLOYMENT.md).
 */
export function startSchedulers(ctx: WorkerContext): () => void {
  const timers: NodeJS.Timeout[] = []
  const every = (ms: number, name: string, fn: () => Promise<void>) => {
    let running = false
    const t = setInterval(async () => {
      if (running) return
      running = true
      try {
        await fn()
      } catch (err) {
        ctx.logger.error({ err, scheduler: name }, 'scheduler tick failed')
      } finally {
        running = false
      }
    }, ms)
    t.unref()
    timers.push(t)
  }

  // Outbox dispatcher: claim unpublished domain events and enqueue them for side effects
  every(ctx.config.OUTBOX_POLL_MS, 'dispatch-outbox', async () => {
    const events = await ctx.db.$transaction((tx) => claimUnpublishedEvents(tx, 200))
    if (!events.length) return
    await ctx.queues.events.addBulk(events.map((e) => ({ name: e.type, data: { eventId: e.id }, opts: { jobId: `evt-${e.id}`, attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 500, removeOnFail: 2000 } })))
  })

  // Due follow-ups → followups queue
  every(ctx.config.FOLLOWUP_POLL_MS, 'due-followups', async () => {
    const due = await new FollowUpService(ctx.db).listDue(new Date(), 100)
    if (!due.length) return
    await ctx.queues.followups.addBulk(due.map((f) => ({ name: 'followup', data: { followUpId: f.id }, opts: { jobId: `fu-${f.id}`, attempts: 3, backoff: { type: 'exponential', delay: 60000 }, removeOnComplete: 500 } })))
  })

  // Knowledge governance: expire documents past validity (hourly)
  every(60 * 60 * 1000, 'expire-knowledge', async () => {
    const n = await new KnowledgeIngestionService(ctx.db, ctx.providers, ctx.logger).expireOutdated()
    if (n) ctx.logger.info({ expired: n }, 'knowledge documents expired')
  })

  // SLA: flag leads exceeding stage max hours (every 10 min) → domain event lead.inactive
  every(10 * 60 * 1000, 'sla-check', async () => {
    const stale = await ctx.db.lead.findMany({ where: { status: 'open', stage: { maxHoursInStage: { not: null } } }, include: { stage: true }, take: 500 })
    const now = Date.now()
    for (const lead of stale) {
      const limit = lead.stage.maxHoursInStage!
      if (now - lead.stageEnteredAt.getTime() < limit * 36e5) continue
      const recent = await ctx.db.domainEvent.findFirst({ where: { type: 'lead.inactive', aggregateId: lead.id, occurredAt: { gte: new Date(now - 24 * 36e5) } } })
      if (recent) continue
      await ctx.db.domainEvent.create({ data: { tenantId: lead.tenantId, unitId: lead.unitId, type: 'lead.inactive', aggregateType: 'lead', aggregateId: lead.id, payload: { stage: lead.stage.key, hoursInStage: Math.round((now - lead.stageEnteredAt.getTime()) / 36e5), limit, contactId: lead.contactId, ownerId: lead.ownerId }, actor: 'system' } })
    }
  })

  // Idempotency key cleanup (daily, keep 7 days)
  every(24 * 60 * 60 * 1000, 'cleanup-idempotency', async () => {
    await ctx.db.idempotencyKey.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 7 * 864e5) } } })
  })

  return () => timers.forEach((t) => clearInterval(t))
}
