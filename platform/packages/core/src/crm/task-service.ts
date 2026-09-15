import type { DbTx, Prisma } from '@vox/db'
import { emitEvent } from '../events/outbox.js'

/**
 * Creates a task and emits `task.created` in the same transaction, so assignees get notified
 * (bell/e-mail) whatever created it: the agent, a follow-up, a reminder, an automation or a user.
 */
export async function createTask(db: DbTx, args: { data: Prisma.TaskUncheckedCreateInput }) {
  const task = await db.task.create(args)
  const lead = task.leadId
    ? await db.lead.findUnique({ where: { id: task.leadId }, select: { unitId: true } })
    : null
  await emitEvent(db, {
    tenantId: task.tenantId,
    unitId: lead?.unitId ?? null,
    type: 'task.created',
    aggregateType: 'task',
    aggregateId: task.id,
    payload: {
      taskId: task.id,
      leadId: task.leadId,
      assigneeId: task.assigneeId,
      title: task.title,
      kind: task.kind,
      priority: task.priority,
      dueAt: task.dueAt?.toISOString() ?? null,
      createdBy: task.createdBy,
    },
    actor: task.createdBy,
  })
  return task
}
