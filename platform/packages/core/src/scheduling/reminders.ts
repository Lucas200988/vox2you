import type { Db, Prisma } from '@vox/db'
import { formatInZone } from '@vox/shared'
import { emitEvent } from '../events/outbox.js'
import { FollowUpService, loadFollowUpPolicy } from '../followup/service.js'
import type { RealtimePublisher } from '../jobs/types.js'
import type { Logger } from '../logger.js'
import { OutboundService } from '../outbound/service.js'
import type { Providers } from '../providers/index.js'
import { loadAgentSettings } from '../settings/agent-settings.js'
import { systemContext } from '../tenant/context.js'
import { isSessionWindowOpen } from '../window/policy.js'
import { AppointmentService } from './appointment-service.js'

export type ReminderKind = '24h' | '2h'
export interface ReminderOutcome {
  appointmentId: string
  kind: ReminderKind
  /** text = free message inside the 24h window; template = approved WhatsApp template; task = consultant calls */
  via: 'text' | 'template' | 'task'
}

type Appt = Prisma.AppointmentGetPayload<{
  include: { contact: true; unit: true; lead: { select: { id: true; ownerId: true } } }
}>

const TEMPLATE_NAMES = ['visit_reminder', 'lembrete_visita', 'lembrete_de_visita']

/**
 * Visit reminders and outcomes, run by the worker scheduler:
 *  - 24h and 2h before a visit: message when the WhatsApp window is open, an approved template
 *    otherwise, and a call task for the consultant when neither is possible. Never twice.
 *  - 2h after the end without an outcome: task asking the consultant to record attendance.
 *  - 24h after the end still without an outcome: marked no-show and a gentle follow-up is planned.
 * Text is deterministic (no LLM): date, time and address come from the appointment and the unit.
 */
export class VisitReminderService {
  constructor(
    private readonly db: Db,
    private readonly providers: Providers,
    private readonly logger: Logger,
    private readonly realtime?: RealtimePublisher,
  ) {}

  async sendDueReminders(now = new Date()): Promise<ReminderOutcome[]> {
    const out: ReminderOutcome[] = []
    const windows: Array<{ kind: ReminderKind; minMs: number; maxMs: number }> = [
      { kind: '24h', minMs: 20 * 36e5, maxMs: 25 * 36e5 },
      { kind: '2h', minMs: 45 * 60e3, maxMs: 2.5 * 36e5 },
    ]
    for (const w of windows) {
      const due = await this.db.appointment.findMany({
        where: {
          status: { in: ['scheduled', 'confirmed'] },
          ...(w.kind === '24h' ? { reminder24hSentAt: null } : { reminder2hSentAt: null }),
          startsAt: {
            gte: new Date(now.getTime() + w.minMs),
            lte: new Date(now.getTime() + w.maxMs),
          },
        },
        include: { contact: true, unit: true, lead: { select: { id: true, ownerId: true } } },
        orderBy: { startsAt: 'asc' },
        take: 200,
      })
      for (const appt of due) {
        try {
          out.push(await this.remind(appt, w.kind, now))
        } catch (err) {
          this.logger.error({ err, appointmentId: appt.id, kind: w.kind }, 'visit reminder failed')
        }
      }
    }
    return out
  }

  private async remind(appt: Appt, kind: ReminderKind, now: Date): Promise<ReminderOutcome> {
    const ctx = systemContext(appt.tenantId, 'system:reminders')
    const tz = appt.timezone || appt.unit.timezone
    const when = formatInZone(appt.startsAt, tz, "EEEE, dd/MM 'às' HH:mm")
    const time = formatInZone(appt.startsAt, tz, 'HH:mm')
    const first = appt.contact.name?.trim().split(/\s+/)[0] ?? ''
    const settings = await loadAgentSettings(this.db, appt.unitId, this.providers.models)
    const address = appt.unit.address ? ` Endereço: ${appt.unit.address}.` : ''
    const phone = appt.unit.phone ? ` Qualquer imprevisto, fale conosco: ${appt.unit.phone}.` : ''
    const greeting = first ? `${first}, ` : ''
    const text =
      kind === '24h'
        ? `${greeting}passando para lembrar da sua ${settings.visitLabel} na VOX2you ${appt.unit.name}: ${when}.${address} Posso confirmar sua presença? Se precisar remarcar, é só me dizer por aqui.`
        : `${greeting}sua visita na VOX2you ${appt.unit.name} é hoje às ${time}.${address} Te esperamos!${phone}`

    const conversation = await this.db.conversation.findFirst({
      where: {
        tenantId: appt.tenantId,
        contactId: appt.contactId,
        status: 'open',
        channel: { kind: 'whatsapp' },
      },
      orderBy: { lastInboundAt: 'desc' },
      include: { channel: true },
    })

    let via: ReminderOutcome['via'] = 'task'
    if (conversation) {
      const outbound = new OutboundService(this.db, this.providers, this.realtime)
      if (isSessionWindowOpen(conversation.channel.kind, conversation.lastInboundAt, now)) {
        await outbound.send(ctx, conversation.id, { text }, 'system')
        via = 'text'
      } else {
        const template = await this.db.messageTemplate.findFirst({
          where: { tenantId: appt.tenantId, status: 'approved', name: { in: TEMPLATE_NAMES } },
        })
        if (template) {
          const vars = [first || 'Olá', when, appt.unit.address ?? appt.unit.name]
          await outbound.send(
            ctx,
            conversation.id,
            {
              templateName: template.name,
              templateLanguage: template.language,
              templateVariables: vars.slice(0, template.variables.length || vars.length),
            },
            'system',
          )
          via = 'template'
        }
      }
    }
    if (via === 'task') {
      await this.db.task.create({
        data: {
          tenantId: appt.tenantId,
          leadId: appt.leadId,
          assigneeId: appt.lead?.ownerId ?? null,
          title: `Confirmar visita por telefone: ${appt.contact.name ?? appt.contact.phone ?? 'contato'} (${when})`,
          description:
            'A janela de 24h do WhatsApp está fechada e não há template aprovado para lembrete.',
          kind: 'call',
          priority: kind === '2h' ? 'urgent' : 'high',
          dueAt: appt.startsAt,
          createdBy: 'system:reminders',
        },
      })
    }
    await this.db.appointment.update({
      where: { id: appt.id },
      data: kind === '24h' ? { reminder24hSentAt: now } : { reminder2hSentAt: now },
    })
    await this.db.$transaction((tx) =>
      emitEvent(tx, {
        type: 'appointment.reminder_sent',
        tenantId: appt.tenantId,
        unitId: appt.unitId,
        aggregateType: 'lead',
        aggregateId: appt.leadId ?? appt.contactId,
        payload: { appointmentId: appt.id, kind, via, contactId: appt.contactId },
        actor: 'system',
      }),
    )
    return { appointmentId: appt.id, kind, via }
  }

  async handleOverdue(now = new Date()): Promise<{ prompted: number; noShow: number }> {
    const result = { prompted: 0, noShow: 0 }

    // 1. Two hours after the end without an outcome: the consultant records what happened
    const pending = await this.db.appointment.findMany({
      where: {
        status: { in: ['scheduled', 'confirmed'] },
        outcomePromptedAt: null,
        endsAt: { lt: new Date(now.getTime() - 2 * 36e5) },
      },
      include: { contact: true, lead: { select: { id: true, ownerId: true } } },
      take: 200,
    })
    for (const appt of pending) {
      try {
        await this.db.task.create({
          data: {
            tenantId: appt.tenantId,
            leadId: appt.leadId,
            assigneeId: appt.lead?.ownerId ?? null,
            title: `Registrar resultado da visita de ${appt.contact.name ?? appt.contact.phone ?? 'contato'}: compareceu ou faltou?`,
            description:
              'Marque "compareceu" ou "não compareceu" no agendamento. Sem registro em 24h a visita é tratada como falta e um follow-up de reagendamento é enviado.',
            kind: 'visit',
            priority: 'high',
            dueAt: now,
            createdBy: 'system:reminders',
          },
        })
        await this.db.appointment.update({
          where: { id: appt.id },
          data: { outcomePromptedAt: now },
        })
        await this.db.$transaction((tx) =>
          emitEvent(tx, {
            type: 'appointment.outcome_pending',
            tenantId: appt.tenantId,
            unitId: appt.unitId,
            aggregateType: 'lead',
            aggregateId: appt.leadId ?? appt.contactId,
            payload: { appointmentId: appt.id },
            actor: 'system',
          }),
        )
        result.prompted++
      } catch (err) {
        this.logger.error({ err, appointmentId: appt.id }, 'outcome prompt failed')
      }
    }

    // 2. A day after the end still without an outcome: assume no-show and plan a gentle follow-up
    const stale = await this.db.appointment.findMany({
      where: {
        status: { in: ['scheduled', 'confirmed'] },
        endsAt: { lt: new Date(now.getTime() - 24 * 36e5) },
      },
      include: { unit: true },
      take: 200,
    })
    const appointments = new AppointmentService(this.db, this.providers.calendar)
    for (const appt of stale) {
      try {
        const ctx = systemContext(appt.tenantId, 'system:reminders')
        await appointments.setStatus(ctx, appt.id, 'no_show')
        if (appt.leadId) {
          const policy = await loadFollowUpPolicy(this.db, appt.unitId)
          const strategy = policy.strategies['no_show'] ?? {}
          const conversation = await this.db.conversation.findFirst({
            where: { leadId: appt.leadId, status: 'open' },
            select: { id: true },
          })
          await this.db.$transaction((tx) =>
            FollowUpService.scheduleTx(tx, ctx, {
              leadId: appt.leadId!,
              conversationId: conversation?.id,
              unitId: appt.unitId,
              timezone: appt.unit.timezone,
              scheduledAt: new Date(now.getTime() + (strategy.delayHours ?? 3) * 36e5),
              reason: 'scenario:no_show',
              goal:
                strategy.goal ??
                'A visita não aconteceu: perguntar com leveza se houve algum imprevisto e oferecer 2 novos horários',
              scenario: 'no_show',
              strategy: 'text',
              policy,
            }),
          )
          await this.db.lead.update({
            where: { id: appt.leadId },
            data: { nextBestAction: 'Visita não realizada: reagendar com leveza' },
          })
        }
        result.noShow++
      } catch (err) {
        this.logger.error({ err, appointmentId: appt.id }, 'no-show handling failed')
      }
    }
    return result
  }
}
