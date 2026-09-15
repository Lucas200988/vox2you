import {
  NotificationService,
  notificationForEvent,
  systemContext,
  type EmailProvider,
} from '@vox/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inbound, randomPhone, RUN, setupTestEnv, type TestEnv } from './helpers.js'

class RecordingEmail implements EmailProvider {
  readonly name = 'recording'
  sent: Array<{ to: string | string[]; subject: string; text?: string }> = []
  async send(m: { to: string | string[]; subject: string; text?: string }) {
    this.sent.push(m)
    return { id: `mail-${this.sent.length}` }
  }
}

/**
 * Seller notifications: handoff → assignee (bell + e-mail), SLA → owner, tasks created by the
 * agent → assignee (bell only), deduplicated within 24h, and readable/markable per user only.
 */
describe.skipIf(!RUN)('Seller notifications', () => {
  let env: TestEnv
  let email: RecordingEmail
  let service: NotificationService
  let sellerId: string

  beforeAll(async () => {
    env = await setupTestEnv()
    email = new RecordingEmail()
    service = new NotificationService(env.db, { email, webUrl: 'https://crm.example.com' })
    const seller = await env.db.user.upsert({
      where: { tenantId_email: { tenantId: env.seed.tenantId, email: 'notify-seller@test.local' } },
      update: { status: 'active' },
      create: {
        tenantId: env.seed.tenantId,
        email: 'notify-seller@test.local',
        name: 'Vendedora Notificada',
        role: 'seller',
        passwordHash: 'x',
        status: 'active',
        units: { create: { unitId: env.seed.unitId, role: 'seller' } },
      },
    })
    sellerId = seller.id
    await env.db.notification.deleteMany({ where: { userId: sellerId } })
  })
  afterAll(async () => {
    await env?.db.$disconnect()
  })

  it('handoff.requested notifies the assignee in-app and by e-mail, once per conversation', async () => {
    const phone = randomPhone()
    await inbound(env, phone, 'Tenho vergonha de falar em público', { name: 'Marina Handoff' })
    const res = await inbound(env, phone, 'quero falar com um atendente humano')
    expect(res.run?.decision).toBe('handoff')
    const event = await env.db.domainEvent.findFirst({
      where: { type: 'handoff.requested', aggregateId: res.conversationId },
    })
    expect(event).toBeTruthy()
    // route the handoff to our seller regardless of who the round-robin picked
    const payload = { ...(event!.payload as Record<string, unknown>), assigneeId: sellerId }
    const input = await notificationForEvent(env.db, service, {
      tenantId: event!.tenantId,
      unitId: event!.unitId,
      type: event!.type,
      aggregateType: event!.aggregateType,
      aggregateId: event!.aggregateId,
      payload,
    })
    expect(input).toMatchObject({ kind: 'handoff', userIds: [sellerId] })
    expect(input!.title).toContain('Marina')
    expect(input!.link).toBe(`/inbox?conversation=${res.conversationId}`)

    const first = await service.notify(input!)
    expect(first).toEqual({ created: 1, emailed: 1 })
    expect(email.sent.at(-1)!.to).toBe('notify-seller@test.local')
    expect(email.sent.at(-1)!.subject).toContain('Marina')
    expect(email.sent.at(-1)!.text).toContain(
      `https://crm.example.com/inbox?conversation=${res.conversationId}`,
    )
    // same event again (retry / duplicate) → nothing new
    const again = await service.notify(input!)
    expect(again).toEqual({ created: 0, emailed: 0 })
  })

  it('SLA breach goes to the lead owner and the agent task to its assignee without e-mail', async () => {
    const phone = randomPhone()
    const res = await inbound(env, phone, 'Oi, quero saber mais sobre o curso', {
      name: 'Paulo SLA',
    })
    await env.db.lead.update({ where: { id: res.leadId! }, data: { ownerId: sellerId } })
    const sla = await notificationForEvent(env.db, service, {
      tenantId: env.seed.tenantId,
      unitId: env.seed.unitId,
      type: 'lead.inactive',
      aggregateType: 'lead',
      aggregateId: res.leadId!,
      payload: { stage: 'discovery', hoursInStage: 30, limit: 24 },
    })
    expect(sla).toMatchObject({ kind: 'sla', userIds: [sellerId], link: `/leads/${res.leadId}` })
    expect(sla!.title).toContain('Paulo')

    const before = email.sent.length
    const task = await notificationForEvent(env.db, service, {
      tenantId: env.seed.tenantId,
      unitId: env.seed.unitId,
      type: 'task.created',
      aggregateType: 'task',
      aggregateId: 'task-1',
      payload: {
        taskId: 'task-1',
        title: 'Ligar para o lead',
        assigneeId: sellerId,
        leadId: res.leadId,
        createdBy: 'agent',
      },
    })
    expect(task).toMatchObject({ kind: 'task', email: false })
    const r = await service.notify(task!)
    expect(r).toEqual({ created: 1, emailed: 0 })
    expect(email.sent.length).toBe(before)
    // a task the user created themselves never pings them back
    const own = await notificationForEvent(env.db, service, {
      tenantId: env.seed.tenantId,
      unitId: env.seed.unitId,
      type: 'task.created',
      aggregateType: 'task',
      aggregateId: 'task-2',
      payload: {
        taskId: 'task-2',
        title: 'Minha tarefa',
        assigneeId: sellerId,
        createdBy: `user:${sellerId}`,
      },
    })
    expect(own).toBeNull()
  })

  it('tasks created through the CRM emit task.created with the assignee', async () => {
    const { createTask } = await import('@vox/core')
    const task = await createTask(env.db, {
      data: {
        tenantId: env.seed.tenantId,
        title: 'Confirmar visita',
        assigneeId: sellerId,
        createdBy: 'agent',
      },
    })
    const event = await env.db.domainEvent.findFirst({
      where: { type: 'task.created', aggregateId: task.id },
    })
    expect(event?.payload).toMatchObject({
      taskId: task.id,
      assigneeId: sellerId,
      title: 'Confirmar visita',
      createdBy: 'agent',
    })
  })

  it('mirrors a notification to Slack once when the tenant configured a webhook', async () => {
    const posts: Array<{ url: string; text: string }> = []
    const withSlack = new NotificationService(env.db, {
      webUrl: 'https://crm.example.com',
      slackWebhook: async () => 'https://hooks.slack.com/services/T/B/x',
      slackPost: async (url, payload) => void posts.push({ url, text: payload.text }),
    })
    const r = await withSlack.notify({
      tenantId: env.seed.tenantId,
      userIds: [sellerId, env.seed.adminUserId],
      kind: 'handoff',
      title: 'Cliente pediu humano',
      body: 'motivo: pediu atendente',
      link: '/inbox?conversation=abc',
      email: false,
    })
    expect(r.created).toBe(2)
    expect(posts).toHaveLength(1)
    expect(posts[0]!.text).toContain('*Cliente pediu humano*')
    expect(posts[0]!.text).toContain('https://crm.example.com/inbox?conversation=abc')
    // no webhook → nothing posted, no error
    const silent = new NotificationService(env.db, {
      slackWebhook: async () => undefined,
      slackPost: async (url, p) => void posts.push({ url, text: p.text }),
    })
    await silent.notify({
      tenantId: env.seed.tenantId,
      userIds: [sellerId],
      kind: 'system',
      title: 'Sem slack',
      email: false,
    })
    expect(posts).toHaveLength(1)
  })

  it('lists and marks read only for the owning user', async () => {
    const mine = systemContext(env.seed.tenantId)
    mine.userId = sellerId
    const list = await service.list(mine)
    expect(list.items.length).toBeGreaterThanOrEqual(2)
    expect(list.unread).toBe(list.items.filter((n) => !n.readAt).length)
    const target = list.items[0]!
    const other = systemContext(env.seed.tenantId)
    other.userId = env.seed.adminUserId
    expect(await service.markRead(other, target.id)).toEqual({ updated: 0 })
    expect(await service.markRead(mine, target.id)).toEqual({ updated: 1 })
    expect((await service.list(mine)).unread).toBe(list.unread - 1)
    await service.markAllRead(mine)
    expect((await service.list(mine)).unread).toBe(0)
  })
})
