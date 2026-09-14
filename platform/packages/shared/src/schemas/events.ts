export const DOMAIN_EVENT_TYPES = [
  'contact.created',
  'contact.updated',
  'conversation.opened',
  'conversation.closed',
  'conversation.mode_changed',
  'message.received',
  'message.sent',
  'message.status_changed',
  'lead.created',
  'lead.updated',
  'lead.qualified',
  'lead.scored',
  'lead.won',
  'lead.lost',
  'lead.inactive',
  'stage.changed',
  'fact.captured',
  'handoff.requested',
  'handoff.resumed',
  'appointment.created',
  'appointment.rescheduled',
  'appointment.cancelled',
  'appointment.completed',
  'appointment.no_show',
  'followup.scheduled',
  'followup.sent',
  'followup.cancelled',
  'consent.granted',
  'consent.revoked',
  'payment.created',
  'payment.confirmed',
  'tag.added',
  'task.created',
  'agent.run_completed',
  'agent.validation_blocked',
  'knowledge.published',
  'prompt.published',
] as const
export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[number]

export interface DomainEventInput {
  type: DomainEventType
  tenantId: string
  unitId?: string | null
  aggregateType: string
  aggregateId: string
  payload: Record<string, unknown>
  actor?: string
}
