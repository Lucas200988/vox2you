import type { DbTx } from '@vox/db'
import type { DomainEventInput } from '@vox/shared'

/**
 * Transactional outbox. Call inside the same transaction as the state change.
 * The worker polls unpublished events and dispatches them to the queue.
 */
export async function emitEvent(tx: DbTx, event: DomainEventInput): Promise<{ id: string }> {
  const created = await tx.domainEvent.create({
    data: {
      tenantId: event.tenantId,
      unitId: event.unitId ?? null,
      type: event.type,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payload as object,
      actor: event.actor ?? null,
    },
    select: { id: true },
  })
  return created
}

export async function emitEvents(tx: DbTx, events: DomainEventInput[]): Promise<void> {
  for (const e of events) await emitEvent(tx, e)
}

/** Claims a batch of unpublished events (for the dispatcher). */
export async function claimUnpublishedEvents(tx: DbTx, limit = 100) {
  const events = await tx.domainEvent.findMany({
    where: { publishedAt: null },
    orderBy: { occurredAt: 'asc' },
    take: limit,
  })
  if (events.length) {
    await tx.domainEvent.updateMany({
      where: { id: { in: events.map((e) => e.id) } },
      data: { publishedAt: new Date() },
    })
  }
  return events
}
