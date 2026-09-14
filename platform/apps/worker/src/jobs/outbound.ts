import type { OutboundJob } from '@vox/core'
import { isSessionWindowOpen } from '@vox/core'
import type { WorkerContext } from '../main.js'

/** Sends a pre-created queued Message (automation/campaign sends). Human sends go inline via the API. */
export async function processOutbound(ctx: WorkerContext, job: OutboundJob) {
  const message = await ctx.db.message.findFirst({ where: { id: job.messageId, tenantId: job.tenantId }, include: { conversation: { include: { channel: true, contact: { include: { identities: true } } } } } })
  if (!message || message.status !== 'queued') return { skipped: 'not_queued' }
  const conv = message.conversation
  if (message.type !== 'template' && !isSessionWindowOpen(conv.channel.kind, conv.lastInboundAt)) {
    await ctx.db.message.update({ where: { id: message.id }, data: { status: 'blocked', errorTitle: 'session_window_closed' } })
    return { skipped: 'window_closed' }
  }
  const identity = conv.contact.identities.find((i) => i.channel === conv.channel.kind)
  const to = identity?.externalId ?? (conv.contact.phone ?? '').replace(/^\+/, '')
  const messaging = ctx.providers.messagingFor ? ctx.providers.messagingFor({ provider: conv.channel.provider, externalId: conv.channel.externalId, config: conv.channel.config }) : ctx.providers.messaging
  try {
    const sent = message.type === 'template' && message.templateName
      ? await messaging.sendTemplate({ to, templateName: message.templateName, language: 'pt_BR', bodyVariables: ((message.payload as { variables?: string[] })?.variables ?? []) })
      : await messaging.sendText({ to, text: message.text ?? '' })
    await ctx.db.message.update({ where: { id: message.id }, data: { status: 'sent', sentAt: new Date(), providerMessageId: sent.providerMessageId } })
    await ctx.realtime.publish({ type: 'message.status', tenantId: job.tenantId, unitId: conv.unitId, conversationId: conv.id, payload: { messageId: message.id, status: 'sent' }, at: new Date().toISOString() })
    return { sent: true }
  } catch (err) {
    await ctx.db.message.update({ where: { id: message.id }, data: { status: 'failed', errorTitle: (err as Error).message } })
    throw err
  }
}
