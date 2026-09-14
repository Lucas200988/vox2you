import { createHmac } from 'node:crypto'
import type { Prisma } from '@vox/db'
import { AutomationEngine, FollowUpService, LeadService, loadFollowUpPolicy, systemContext, type AutomationAction, type DomainEventJob } from '@vox/core'
import { sha256 } from '@vox/shared'
import type { WorkerContext } from '../main.js'

/**
 * Domain event dispatcher: runs automations, tenant webhooks, conversion events and realtime
 * notifications for one outbox event. Each side effect is isolated so one failure doesn't block others.
 */
export async function processDomainEvent(ctx: WorkerContext, job: DomainEventJob) {
  const event = await ctx.db.domainEvent.findUnique({ where: { id: job.eventId } })
  if (!event) return { skipped: 'missing' }
  const payload = (event.payload ?? {}) as Record<string, unknown>
  const results: Record<string, unknown> = {}

  // Realtime fan-out for UI-relevant events
  if (['lead.created', 'stage.changed', 'lead.scored', 'lead.qualified', 'lead.won', 'lead.lost', 'fact.captured', 'tag.added', 'task.created'].includes(event.type) && event.aggregateType === 'lead') {
    await ctx.realtime.publish({ type: 'lead.updated', tenantId: event.tenantId, unitId: event.unitId, leadId: event.aggregateId, payload: { event: event.type, ...payload }, at: event.occurredAt.toISOString() })
  }

  // Automations
  const engine = new AutomationEngine(ctx.db)
  const matched = await engine.match({ id: event.id, tenantId: event.tenantId, unitId: event.unitId, type: event.type, aggregateType: event.aggregateType, aggregateId: event.aggregateId, payload, actor: event.actor })
  for (const m of matched) {
    try {
      const out = []
      for (const action of m.actions) out.push(await runAction(ctx, event, payload, action, m.automationId))
      await engine.recordRun(m.automationId, event.id, 'success', out)
      results[m.name] = out
    } catch (err) {
      await engine.recordRun(m.automationId, event.id, 'failed', undefined, (err as Error).message)
      ctx.logger.error({ err, automation: m.name, eventId: event.id }, 'automation failed')
    }
  }

  // Tenant webhooks
  const hooks = await ctx.db.webhook.findMany({ where: { tenantId: event.tenantId, active: true, events: { has: event.type } } })
  for (const hook of hooks) {
    const delivery = await ctx.db.webhookDelivery.create({ data: { webhookId: hook.id, eventId: event.id } })
    try {
      const body = JSON.stringify({ id: event.id, type: event.type, occurredAt: event.occurredAt, aggregateType: event.aggregateType, aggregateId: event.aggregateId, payload })
      const res = await fetch(hook.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Vox-Event': event.type, 'X-Vox-Signature': `sha256=${createHmac('sha256', hook.secret).update(body).digest('hex')}` }, body, signal: AbortSignal.timeout(ctx.config.WEBHOOK_TIMEOUT_MS) })
      await ctx.db.webhookDelivery.update({ where: { id: delivery.id }, data: { status: res.ok ? 'success' : 'failed', attempts: 1, responseCode: res.status, deliveredAt: res.ok ? new Date() : null } })
    } catch (err) {
      await ctx.db.webhookDelivery.update({ where: { id: delivery.id }, data: { status: 'failed', attempts: 1, lastError: (err as Error).message } })
    }
  }

  // Conversion events (Meta CAPI or noop)
  const conversionMap: Record<string, 'Lead' | 'QualifiedLead' | 'Schedule' | 'Visit' | 'Purchase'> = { 'lead.created': 'Lead', 'lead.qualified': 'QualifiedLead', 'appointment.created': 'Schedule', 'appointment.completed': 'Visit', 'lead.won': 'Purchase' }
  const conversionName = conversionMap[event.type]
  if (conversionName && ctx.providers.conversion) {
    const contactId = (payload['contactId'] as string | undefined) ?? null
    const contact = contactId ? await ctx.db.contact.findUnique({ where: { id: contactId }, include: { attribution: { orderBy: { createdAt: 'desc' }, take: 1 } } }) : null
    const attribution = contact?.attribution[0]
    const row = await ctx.db.conversionEvent.create({ data: { tenantId: event.tenantId, contactId, leadId: event.aggregateType === 'lead' ? event.aggregateId : null, eventName: conversionName, provider: ctx.providers.conversion.name, payload: { eventId: event.id } } })
    try {
      const res = await ctx.providers.conversion.track({ eventName: conversionName, eventId: event.id, eventTime: event.occurredAt, user: { phoneHash: contact?.phone ? sha256(contact.phone.replace(/\D/g, '')) : undefined, emailHash: contact?.email ? sha256(contact.email.toLowerCase()) : undefined, externalId: contactId ?? undefined, fbclid: attribution?.fbclid ?? undefined, ctwaClid: attribution?.ctwaClid ?? undefined } })
      await ctx.db.conversionEvent.update({ where: { id: row.id }, data: { status: res.accepted ? 'sent' : 'failed', sentAt: new Date() } })
    } catch (err) {
      await ctx.db.conversionEvent.update({ where: { id: row.id }, data: { status: 'failed', error: (err as Error).message } })
    }
  }

  return results
}

async function runAction(ctx: WorkerContext, event: { tenantId: string; unitId: string | null; aggregateType: string; aggregateId: string }, payload: Record<string, unknown>, action: AutomationAction, automationId: string) {
  const tctx = systemContext(event.tenantId, `automation:${automationId}`)
  const leadId = event.aggregateType === 'lead' ? event.aggregateId : (payload['leadId'] as string | undefined)
  const conversationId = event.aggregateType === 'conversation' ? event.aggregateId : undefined
  switch (action.type) {
    case 'create_task': {
      if (!leadId) return { skipped: 'no_lead' }
      const lead = await ctx.db.lead.findUnique({ where: { id: leadId }, select: { ownerId: true } })
      const task = await ctx.db.task.create({ data: { tenantId: event.tenantId, leadId, title: action.title, kind: action.kind ?? 'todo', priority: 'high', assigneeId: action.assigneeId ?? lead?.ownerId ?? null, dueAt: action.dueInHours ? new Date(Date.now() + action.dueInHours * 36e5) : null, createdBy: tctx.actor } })
      return { task: task.id }
    }
    case 'add_tag': {
      if (!leadId) return { skipped: 'no_lead' }
      await new LeadService(ctx.db).addTag(tctx, leadId, action.tag)
      return { tag: action.tag }
    }
    case 'assign_owner': {
      if (!leadId) return { skipped: 'no_lead' }
      await new LeadService(ctx.db).assign(tctx, leadId, action.userId)
      return { assigned: action.userId }
    }
    case 'change_stage': {
      if (!leadId) return { skipped: 'no_lead' }
      await new LeadService(ctx.db).moveStage(tctx, leadId, { stageKey: action.stageKey }, { reason: `automation:${automationId}` })
      return { stage: action.stageKey }
    }
    case 'schedule_followup': {
      if (!leadId || !event.unitId) return { skipped: 'no_lead' }
      const unit = await ctx.db.unit.findUnique({ where: { id: event.unitId }, select: { timezone: true } })
      const policy = await loadFollowUpPolicy(ctx.db, event.unitId)
      const fu = await ctx.db.$transaction((tx) => FollowUpService.scheduleTx(tx, tctx, { leadId, conversationId, unitId: event.unitId!, timezone: unit?.timezone ?? 'America/Cuiaba', scheduledAt: new Date(Date.now() + action.hours * 36e5), reason: action.reason, policy }))
      return { followUp: fu?.id ?? null }
    }
    case 'send_message':
    case 'send_template': {
      const conv = conversationId ? await ctx.db.conversation.findUnique({ where: { id: conversationId } }) : leadId ? await ctx.db.conversation.findFirst({ where: { leadId, status: 'open' } }) : null
      if (!conv) return { skipped: 'no_conversation' }
      const message = await ctx.db.message.create({ data: { tenantId: event.tenantId, conversationId: conv.id, direction: 'outbound', type: action.type === 'send_template' ? 'template' : 'text', authorType: 'system', text: action.type === 'send_message' ? action.text : `[template ${action.templateName}]`, templateName: action.type === 'send_template' ? action.templateName : null, status: 'queued', payload: (action.type === 'send_template' ? { variables: action.variables ?? [] } : {}) as Prisma.InputJsonValue } })
      await ctx.queues.outbound.add('send', { tenantId: event.tenantId, conversationId: conv.id, messageId: message.id })
      return { queued: message.id }
    }
    case 'call_webhook': {
      const body = JSON.stringify({ event, payload })
      const res = await fetch(action.url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(action.secret ? { 'X-Vox-Signature': `sha256=${createHmac('sha256', action.secret).update(body).digest('hex')}` } : {}) }, body, signal: AbortSignal.timeout(ctx.config.WEBHOOK_TIMEOUT_MS) })
      return { status: res.status }
    }
    case 'send_email': {
      if (!ctx.providers.email) return { skipped: 'no_email_provider' }
      const r = await ctx.providers.email.send({ to: action.to, subject: action.subject, text: action.text })
      return { email: r.id }
    }
    case 'notify_user': {
      const user = await ctx.db.user.findUnique({ where: { id: action.userId }, select: { email: true } })
      if (user && ctx.providers.email) await ctx.providers.email.send({ to: user.email, subject: 'VOX2you CRM — notificação', text: action.message })
      await ctx.realtime.publish({ type: 'lead.updated', tenantId: event.tenantId, unitId: event.unitId, leadId, payload: { notify: action.userId, message: action.message }, at: new Date().toISOString() })
      return { notified: action.userId }
    }
    case 'run_agent':
      return { skipped: 'run_agent requires an inbound message context' }
    default:
      return { skipped: 'unknown_action' }
  }
}
