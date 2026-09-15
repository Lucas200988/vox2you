import type { InboundEvent } from '../providers/messaging.js'

/** Queue names shared by API (producers) and worker (consumers). */
export const QUEUES = {
  inbound: 'inbound', // webhook events → agent
  outbound: 'outbound', // human/system sends, template sends
  ingestion: 'knowledge-ingestion',
  followups: 'followups',
  events: 'domain-events', // outbox dispatch → automations, realtime, webhooks
  scheduler: 'scheduler', // repeatable maintenance jobs
} as const

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES]

export interface InboundJob {
  /** Idempotency key: provider message id (or status id + status) */
  key: string
  event: InboundEvent
  receivedAt: string
}

export interface OutboundJob {
  tenantId: string
  conversationId: string
  messageId: string // pre-created Message row (status queued)
}

export interface IngestionJob {
  documentId: string
}

export interface FollowUpJob {
  followUpId: string
}

export interface DomainEventJob {
  eventId: string
}

export interface SchedulerJob {
  task: 'dispatch-outbox' | 'due-followups' | 'expire-knowledge' | 'sla-check' | 'inactive-leads'
}

export interface RealtimeEvent {
  type:
    | 'conversation.updated'
    | 'message.new'
    | 'message.status'
    | 'lead.updated'
    | 'handoff'
    | 'agent.run'
    | 'notification.new'
  tenantId: string
  unitId?: string | null
  conversationId?: string
  leadId?: string
  payload?: Record<string, unknown>
  at: string
}

export interface RealtimePublisher {
  publish(event: RealtimeEvent): Promise<void>
}

export class NoopRealtimePublisher implements RealtimePublisher {
  readonly events: RealtimeEvent[] = []
  async publish(event: RealtimeEvent): Promise<void> {
    this.events.push(event)
  }
}
