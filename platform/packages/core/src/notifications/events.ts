import type { Db } from '@vox/db'
import type { NotificationService, NotifyInput } from './service.js'

export interface NotifiableEvent {
  tenantId: string
  unitId: string | null
  type: string
  aggregateType: string
  aggregateId: string
  payload: Record<string, unknown>
}

/**
 * Maps domain events to seller notifications. Kept out of the worker so the mapping is testable:
 * handoff → assignee (or unit managers); SLA breach → owner (or managers); visit without outcome →
 * owner; task created by the agent/automations → assignee.
 */
export async function notificationForEvent(
  db: Db,
  service: NotificationService,
  event: NotifiableEvent,
): Promise<NotifyInput | null> {
  const p = event.payload
  const str = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : null)

  switch (event.type) {
    case 'handoff.requested': {
      const conversationId =
        event.aggregateType === 'conversation' ? event.aggregateId : str('conversationId')
      const contact = await contactName(db, str('contactId'))
      const assignee = str('assigneeId')
      const userIds = assignee
        ? [assignee]
        : await service.unitManagers(event.tenantId, event.unitId)
      return {
        tenantId: event.tenantId,
        unitId: event.unitId,
        userIds,
        kind: 'handoff',
        title: `${contact} pediu atendimento humano`,
        body: str('reason') ?? undefined,
        link: conversationId ? `/inbox?conversation=${conversationId}` : '/inbox',
        dedupeKey: `handoff:${conversationId ?? event.aggregateId}`,
      }
    }
    case 'lead.inactive': {
      const lead = await db.lead.findUnique({
        where: { id: event.aggregateId },
        select: { ownerId: true, contact: { select: { name: true, phone: true } } },
      })
      if (!lead) return null
      const userIds = lead.ownerId
        ? [lead.ownerId]
        : await service.unitManagers(event.tenantId, event.unitId)
      const hours = typeof p['hoursInStage'] === 'number' ? (p['hoursInStage'] as number) : null
      return {
        tenantId: event.tenantId,
        unitId: event.unitId,
        userIds,
        kind: 'sla',
        title: `SLA estourado: ${lead.contact.name ?? lead.contact.phone ?? 'lead'} parado em "${str('stage') ?? 'estágio'}"`,
        body: hours
          ? `${hours}h no estágio (limite ${String(p['limit'] ?? '?')}h). Vale um contato hoje.`
          : undefined,
        link: `/leads/${event.aggregateId}`,
        dedupeKey: `sla:${event.aggregateId}`,
      }
    }
    case 'appointment.outcome_pending': {
      const apptId = str('appointmentId')
      if (!apptId) return null
      const appt = await db.appointment.findUnique({
        where: { id: apptId },
        select: {
          leadId: true,
          contact: { select: { name: true, phone: true } },
          lead: { select: { ownerId: true } },
        },
      })
      if (!appt) return null
      const userIds = appt.lead?.ownerId
        ? [appt.lead.ownerId]
        : await service.unitManagers(event.tenantId, event.unitId)
      return {
        tenantId: event.tenantId,
        unitId: event.unitId,
        userIds,
        kind: 'visit_outcome',
        title: `A visita de ${appt.contact.name ?? appt.contact.phone ?? 'lead'} aconteceu?`,
        body: 'Registre o desfecho (compareceu / não veio) para o agente seguir o fluxo certo.',
        link: appt.leadId ? `/leads/${appt.leadId}` : '/agenda',
        dedupeKey: `visit_outcome:${apptId}`,
      }
    }
    case 'task.created': {
      const assignee = str('assigneeId')
      const createdBy = str('createdBy') ?? ''
      if (!assignee || createdBy.startsWith('user:')) return null
      return {
        tenantId: event.tenantId,
        unitId: event.unitId,
        userIds: [assignee],
        kind: 'task',
        title: `Nova tarefa: ${str('title') ?? 'tarefa'}`,
        body: str('dueAt')
          ? `Prazo: ${new Date(str('dueAt')!).toLocaleString('pt-BR')}`
          : undefined,
        link: str('leadId') ? `/leads/${str('leadId')}` : '/tasks',
        dedupeKey: `task:${str('taskId') ?? event.aggregateId}`,
        email: false,
      }
    }
    default:
      return null
  }
}

async function contactName(db: Db, contactId: string | null): Promise<string> {
  if (!contactId) return 'Um cliente'
  const c = await db.contact.findUnique({
    where: { id: contactId },
    select: { name: true, phone: true },
  })
  return c?.name ?? c?.phone ?? 'Um cliente'
}
