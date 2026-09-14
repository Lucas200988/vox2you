import type { Db } from '@vox/db'
import type { TenantContext } from '../tenant/context.js'

export interface TimelineItem {
  id: string
  at: Date
  kind: string
  title: string
  detail?: unknown
  actor?: string | null
}

/** Unified timeline for a lead, derived from domain events + notes + tasks + appointments. */
export class TimelineService {
  constructor(private readonly db: Db) {}

  async forLead(ctx: TenantContext, leadId: string, limit = 200): Promise<TimelineItem[]> {
    const lead = await this.db.lead.findFirst({ where: { id: leadId, tenantId: ctx.tenantId }, select: { id: true, contactId: true } })
    if (!lead) return []
    const [events, notes, tasks, appointments] = await Promise.all([
      this.db.domainEvent.findMany({
        where: {
          tenantId: ctx.tenantId,
          OR: [
            { aggregateType: 'lead', aggregateId: leadId },
            { aggregateType: 'contact', aggregateId: lead.contactId },
            { aggregateType: 'conversation', payload: { path: ['leadId'], equals: leadId } },
            { aggregateType: 'conversation', payload: { path: ['contactId'], equals: lead.contactId } },
          ],
          type: { notIn: ['message.received', 'message.sent', 'message.status_changed'] },
        },
        orderBy: { occurredAt: 'desc' },
        take: limit,
      }),
      this.db.note.findMany({ where: { leadId }, include: { author: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.db.task.findMany({ where: { leadId }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.db.appointment.findMany({ where: { leadId }, orderBy: { startsAt: 'desc' }, take: 20 }),
    ])
    const items: TimelineItem[] = [
      ...events.map((e) => ({ id: e.id, at: e.occurredAt, kind: e.type, title: humanizeEvent(e.type), detail: e.payload, actor: e.actor })),
      ...notes.map((n) => ({ id: n.id, at: n.createdAt, kind: 'note', title: `Nota de ${n.author?.name ?? 'sistema'}`, detail: { body: n.body } })),
      ...tasks.map((t) => ({ id: t.id, at: t.createdAt, kind: 'task', title: `Tarefa: ${t.title}`, detail: { status: t.status, dueAt: t.dueAt } })),
      ...appointments.map((a) => ({ id: a.id, at: a.createdAt, kind: 'appointment', title: `Agendamento: ${a.title}`, detail: { startsAt: a.startsAt, status: a.status } })),
    ]
    return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit)
  }
}

const LABELS: Record<string, string> = {
  'contact.created': 'Contato criado',
  'conversation.opened': 'Conversa iniciada',
  'conversation.closed': 'Conversa encerrada',
  'lead.created': 'Lead criado',
  'lead.qualified': 'Lead qualificado',
  'lead.scored': 'Score atualizado',
  'lead.won': 'Venda realizada',
  'lead.lost': 'Lead perdido',
  'stage.changed': 'Mudança de estágio',
  'fact.captured': 'Informação capturada',
  'handoff.requested': 'Transferido para humano',
  'handoff.resumed': 'IA retomou o atendimento',
  'appointment.created': 'Agendamento criado',
  'followup.scheduled': 'Follow-up agendado',
  'followup.sent': 'Follow-up enviado',
  'consent.revoked': 'Opt-out registrado',
  'consent.granted': 'Consentimento registrado',
  'tag.added': 'Tag adicionada',
  'agent.validation_blocked': 'Resposta da IA bloqueada pela validação',
}

export function humanizeEvent(type: string): string {
  return LABELS[type] ?? type
}
