import type { Db } from '@vox/db'
import type { Logger } from '../logger.js'
import type { EmailProvider } from '../providers/email.js'
import type { RealtimePublisher } from '../jobs/types.js'
import type { TenantContext } from '../tenant/context.js'

export type NotificationKind = 'handoff' | 'sla' | 'visit_outcome' | 'task' | 'hot_lead' | 'system'

export interface NotifyInput {
  tenantId: string
  unitId?: string | null
  userIds: string[]
  kind: NotificationKind
  title: string
  body?: string
  link?: string
  /** Same key within 24h for the same user → not repeated (e.g. one SLA alert per lead per day) */
  dedupeKey?: string
  /** Also mirror by e-mail (default true); needs a configured provider, silently skipped otherwise */
  email?: boolean
}

/**
 * Notifications for CRM users: a row per recipient (bell in the web app), a realtime event so open
 * sessions refresh instantly, and an e-mail mirror when the tenant has SMTP configured
 * (Integrações → E-mail). Failures to e-mail never block the in-app notification.
 */
export class NotificationService {
  constructor(
    private readonly db: Db,
    private readonly deps: {
      email?: EmailProvider | (() => EmailProvider | undefined)
      realtime?: RealtimePublisher
      logger?: Logger
      /** Base URL of the web app for links inside e-mails (e.g. https://vox.sonare.com.br) */
      webUrl?: string
      /** Slack Incoming Webhook URL of the tenant (Integrações → Slack); undefined = not configured */
      slackWebhook?: (tenantId: string) => Promise<string | undefined>
      /** Transport for Slack posts (injectable for tests) */
      slackPost?: (url: string, payload: { text: string }) => Promise<void>
    } = {},
  ) {}

  async notify(input: NotifyInput): Promise<{ created: number; emailed: number }> {
    const userIds = [...new Set(input.userIds.filter(Boolean))]
    if (!userIds.length) return { created: 0, emailed: 0 }
    const since = new Date(Date.now() - 24 * 36e5)
    const users = await this.db.user.findMany({
      where: { id: { in: userIds }, tenantId: input.tenantId, status: 'active' },
      select: { id: true, email: true, name: true, settings: true },
    })
    let created = 0
    let emailed = 0
    for (const user of users) {
      if (input.dedupeKey) {
        const dup = await this.db.notification.findFirst({
          where: {
            tenantId: input.tenantId,
            userId: user.id,
            dedupeKey: input.dedupeKey,
            createdAt: { gte: since },
          },
          select: { id: true },
        })
        if (dup) continue
      }
      const row = await this.db.notification.create({
        data: {
          tenantId: input.tenantId,
          userId: user.id,
          unitId: input.unitId ?? null,
          kind: input.kind,
          title: input.title,
          body: input.body ?? null,
          link: input.link ?? null,
          dedupeKey: input.dedupeKey ?? null,
        },
      })
      created++
      await this.deps.realtime
        ?.publish({
          type: 'notification.new',
          tenantId: input.tenantId,
          unitId: input.unitId ?? null,
          payload: {
            userId: user.id,
            notificationId: row.id,
            kind: input.kind,
            title: input.title,
          },
          at: row.createdAt.toISOString(),
        })
        .catch((err: unknown) =>
          this.deps.logger?.warn({ err }, 'notification realtime publish failed'),
        )

      const prefs = (user.settings as { notifyByEmail?: boolean } | null) ?? {}
      if (
        input.email !== false &&
        prefs.notifyByEmail !== false &&
        (await this.sendEmail(user, input))
      ) {
        emailed++
        await this.db.notification.update({
          where: { id: row.id },
          data: { emailedAt: new Date() },
        })
      }
    }
    if (created > 0) await this.postSlack(input)
    return { created, emailed }
  }

  /** One Slack message per notification (not per recipient), best effort. */
  private async postSlack(input: NotifyInput): Promise<void> {
    if (!this.deps.slackWebhook) return
    try {
      const url = await this.deps.slackWebhook(input.tenantId)
      if (!url) return
      const link =
        input.link && this.deps.webUrl
          ? `${this.deps.webUrl.replace(/\/$/, '')}${input.link}`
          : null
      const text = [`*${input.title}*`, input.body ?? '', link ? `<${link}|Abrir no CRM>` : '']
        .filter(Boolean)
        .join('\n')
      const post =
        this.deps.slackPost ??
        (async (u: string, payload: { text: string }) => {
          const res = await fetch(u, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(8000),
          })
          if (!res.ok) throw new Error(`Slack ${res.status}`)
        })
      await post(url, { text })
    } catch (err) {
      this.deps.logger?.warn({ err }, 'slack notification failed')
    }
  }

  private async sendEmail(
    user: { email: string; name: string },
    input: NotifyInput,
  ): Promise<boolean> {
    const provider = typeof this.deps.email === 'function' ? this.deps.email() : this.deps.email
    if (!provider || provider.name === 'noop') return false
    const link =
      input.link && this.deps.webUrl ? `${this.deps.webUrl.replace(/\/$/, '')}${input.link}` : null
    const text = [
      `Olá, ${user.name.split(' ')[0]}!`,
      '',
      input.title,
      input.body ?? '',
      link ? `\nAbrir no CRM: ${link}` : '',
      '',
      '— VOX2you CRM',
    ]
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
    try {
      await provider.send({ to: user.email, subject: `[VOX2you] ${input.title}`, text })
      return true
    } catch (err) {
      this.deps.logger?.warn({ err, to: user.email }, 'notification e-mail failed')
      return false
    }
  }

  /** Managers/admins/owners of the unit — the fallback audience when a lead has no owner. */
  async unitManagers(tenantId: string, unitId: string | null): Promise<string[]> {
    const rows = await this.db.user.findMany({
      where: {
        tenantId,
        status: 'active',
        OR: [
          { role: { in: ['owner', 'admin'] } },
          ...(unitId ? [{ role: 'manager', units: { some: { unitId } } }] : [{ role: 'manager' }]),
        ],
      },
      select: { id: true },
    })
    return rows.map((r) => r.id)
  }

  async list(ctx: TenantContext, opts: { unreadOnly?: boolean; limit?: number } = {}) {
    if (!ctx.userId) return { items: [], unread: 0 }
    const where = {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      ...(opts.unreadOnly ? { readAt: null } : {}),
    }
    const [items, unread] = await Promise.all([
      this.db.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: opts.limit ?? 20,
      }),
      this.db.notification.count({
        where: { tenantId: ctx.tenantId, userId: ctx.userId, readAt: null },
      }),
    ])
    return { items, unread }
  }

  async markRead(ctx: TenantContext, id: string) {
    if (!ctx.userId) return { updated: 0 }
    const r = await this.db.notification.updateMany({
      where: { id, tenantId: ctx.tenantId, userId: ctx.userId, readAt: null },
      data: { readAt: new Date() },
    })
    return { updated: r.count }
  }

  async markAllRead(ctx: TenantContext) {
    if (!ctx.userId) return { updated: 0 }
    const r = await this.db.notification.updateMany({
      where: { tenantId: ctx.tenantId, userId: ctx.userId, readAt: null },
      data: { readAt: new Date() },
    })
    return { updated: r.count }
  }
}
