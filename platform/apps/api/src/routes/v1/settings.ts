import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import type { Prisma } from '@vox/db'
import { AgentSettingsInputSchema, ROLES } from '@vox/shared'
import {
  DEFAULT_SCORING_WEIGHTS,
  NotFoundError,
  ValidationError,
  hashPassword,
  loadAgentSettings,
  loadFollowUpPolicy,
} from '@vox/core'

const UnitQuery = z.object({ unitId: z.string().uuid() })

export const settingsRoutes: FastifyPluginAsync = async (app) => {
  const db = app.ctx.db

  app.get(
    '/units',
    { schema: { tags: ['settings'] }, preHandler: app.requireAuth() },
    async (req) => {
      const auth = req.auth!
      return {
        items: await db.unit.findMany({
          where: {
            tenantId: auth.tenantId,
            ...(auth.unitIds.length && !['owner', 'admin', 'system'].includes(auth.role)
              ? { id: { in: auth.unitIds } }
              : {}),
          },
          include: { channels: true, calendars: true },
          orderBy: { name: 'asc' },
        }),
      }
    },
  )

  app.patch(
    '/units/:id',
    {
      schema: {
        tags: ['settings'],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          name: z.string().optional(),
          city: z.string().optional(),
          state: z.string().optional(),
          address: z.string().optional(),
          phone: z.string().optional(),
          timezone: z.string().optional(),
        }),
      },
      preHandler: app.requireAuth('settings:write'),
    },
    async (req) => {
      const id = (req.params as { id: string }).id
      const unit = await db.unit.findFirst({ where: { id, tenantId: req.auth!.tenantId } })
      if (!unit) throw new NotFoundError('Unit', id)
      return db.unit.update({ where: { id }, data: req.body as Prisma.UnitUpdateInput })
    },
  )

  app.get(
    '/agent-settings',
    {
      schema: { tags: ['settings'], querystring: UnitQuery },
      preHandler: app.requireAuth('settings:read'),
    },
    async (req) => {
      const { unitId } = req.query as { unitId: string }
      const row = await db.agentSettings.findUnique({ where: { unitId } })
      const resolved = await loadAgentSettings(db, unitId, app.ctx.providers.models)
      return { row, resolved, defaults: app.ctx.providers.models }
    },
  )

  app.put(
    '/agent-settings',
    {
      schema: { tags: ['settings'], querystring: UnitQuery, body: AgentSettingsInputSchema },
      preHandler: app.requireAuth('settings:write'),
    },
    async (req) => {
      const { unitId } = req.query as { unitId: string }
      const unit = await db.unit.findFirst({ where: { id: unitId, tenantId: req.auth!.tenantId } })
      if (!unit) throw new NotFoundError('Unit', unitId)
      const body = req.body as z.infer<typeof AgentSettingsInputSchema>
      const { salesMode, visitLabel, ...columns } = body
      // salesMode / visitLabel live in the `extra` JSON column; merge so other extra keys survive
      const current = await db.agentSettings.findUnique({
        where: { unitId },
        select: { extra: true },
      })
      const extra = {
        ...((current?.extra as Record<string, unknown> | null) ?? {}),
        ...(salesMode !== undefined ? { salesMode } : {}),
        ...(visitLabel !== undefined ? { visitLabel } : {}),
      } as Prisma.InputJsonValue
      const data = {
        ...columns,
        extra,
        models: body.models as Prisma.InputJsonValue | undefined,
        handoffRules: body.handoffRules as Prisma.InputJsonValue | undefined,
        businessHours: body.businessHours as Prisma.InputJsonValue | undefined,
      }
      const updated = await db.agentSettings.upsert({
        where: { unitId },
        update: data,
        create: { unitId, ...data },
      })
      await db.auditLog.create({
        data: {
          tenantId: req.auth!.tenantId,
          userId: req.auth!.userId ?? null,
          actor: req.auth!.actor,
          action: 'agent_settings.update',
          entityType: 'agent_settings',
          entityId: updated.id,
          after: body as Prisma.InputJsonValue,
        },
      })
      return updated
    },
  )

  app.get(
    '/scoring',
    {
      schema: { tags: ['settings'], querystring: UnitQuery },
      preHandler: app.requireAuth('settings:read'),
    },
    async (req) => {
      const { unitId } = req.query as { unitId: string }
      const row = await db.scoringConfig.findFirst({ where: { unitId, isActive: true } })
      return {
        weights: {
          ...DEFAULT_SCORING_WEIGHTS,
          ...((row?.weights as Record<string, number> | null) ?? {}),
        },
        defaults: DEFAULT_SCORING_WEIGHTS,
      }
    },
  )

  app.put(
    '/scoring',
    {
      schema: {
        tags: ['settings'],
        querystring: UnitQuery,
        body: z.object({ weights: z.record(z.string(), z.number()) }),
      },
      preHandler: app.requireAuth('settings:write'),
    },
    async (req) => {
      const { unitId } = req.query as { unitId: string }
      const { weights } = req.body as { weights: Record<string, number> }
      const row = await db.scoringConfig.findFirst({ where: { unitId, isActive: true } })
      return row
        ? db.scoringConfig.update({ where: { id: row.id }, data: { weights } })
        : db.scoringConfig.create({ data: { unitId, name: 'default', weights } })
    },
  )

  app.get(
    '/followup-policy',
    {
      schema: { tags: ['settings'], querystring: UnitQuery },
      preHandler: app.requireAuth('settings:read'),
    },
    async (req) => loadFollowUpPolicy(db, (req.query as { unitId: string }).unitId),
  )

  app.put(
    '/followup-policy',
    {
      schema: {
        tags: ['settings'],
        querystring: UnitQuery,
        body: z.object({
          maxPerWeek: z.number().int().min(0).max(14).optional(),
          minHoursBetween: z.number().int().min(1).optional(),
          maxAttempts: z.number().int().min(0).max(20).optional(),
          quietHoursStart: z.string().optional(),
          quietHoursEnd: z.string().optional(),
          strategies: z
            .record(
              z.string(),
              z.object({ delayHours: z.number().optional(), goal: z.string().optional() }),
            )
            .optional(),
        }),
      },
      preHandler: app.requireAuth('settings:write'),
    },
    async (req) => {
      const { unitId } = req.query as { unitId: string }
      const body = req.body as Record<string, unknown>
      return db.followUpPolicy.upsert({
        where: { unitId },
        update: body as Prisma.FollowUpPolicyUpdateInput,
        create: { ...(body as Omit<Prisma.FollowUpPolicyUncheckedCreateInput, 'unitId'>), unitId },
      })
    },
  )

  app.get(
    '/users',
    { schema: { tags: ['settings'] }, preHandler: app.requireAuth('users:read') },
    async (req) => {
      return {
        items: await db.user.findMany({
          where: { tenantId: req.auth!.tenantId },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
            lastLoginAt: true,
            units: { select: { unitId: true, role: true } },
          },
          orderBy: { name: 'asc' },
        }),
      }
    },
  )

  app.post(
    '/users',
    {
      schema: {
        tags: ['settings'],
        body: z.object({
          name: z.string().min(2),
          email: z.string().email(),
          password: z.string().min(8),
          role: z.enum(ROLES),
          unitIds: z.array(z.string().uuid()).default([]),
        }),
      },
      preHandler: app.requireAuth('users:write'),
    },
    async (req) => {
      const body = req.body as {
        name: string
        email: string
        password: string
        role: (typeof ROLES)[number]
        unitIds: string[]
      }
      if (body.role === 'owner' && req.auth!.role !== 'owner')
        throw new ValidationError('Only owners can create owners')
      const user = await db.user.create({
        data: {
          tenantId: req.auth!.tenantId,
          name: body.name,
          email: body.email.toLowerCase(),
          role: body.role,
          passwordHash: await hashPassword(body.password),
          status: 'active',
          units: { create: body.unitIds.map((unitId) => ({ unitId, role: body.role })) },
        },
        select: { id: true, name: true, email: true, role: true },
      })
      await db.auditLog.create({
        data: {
          tenantId: req.auth!.tenantId,
          userId: req.auth!.userId ?? null,
          actor: req.auth!.actor,
          action: 'user.create',
          entityType: 'user',
          entityId: user.id,
        },
      })
      return user
    },
  )

  app.patch(
    '/users/:id',
    {
      schema: {
        tags: ['settings'],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          name: z.string().optional(),
          role: z.enum(ROLES).optional(),
          status: z.enum(['active', 'disabled']).optional(),
          password: z.string().min(8).optional(),
          unitIds: z.array(z.string().uuid()).optional(),
        }),
      },
      preHandler: app.requireAuth('users:write'),
    },
    async (req) => {
      const id = (req.params as { id: string }).id
      const body = req.body as {
        name?: string
        role?: string
        status?: string
        password?: string
        unitIds?: string[]
      }
      const user = await db.user.findFirst({ where: { id, tenantId: req.auth!.tenantId } })
      if (!user) throw new NotFoundError('User', id)
      return db.user.update({
        where: { id },
        data: {
          name: body.name,
          role: body.role,
          status: body.status,
          ...(body.password ? { passwordHash: await hashPassword(body.password) } : {}),
          ...(body.unitIds
            ? {
                units: {
                  deleteMany: {},
                  create: body.unitIds.map((unitId) => ({ unitId, role: body.role ?? user.role })),
                },
              }
            : {}),
        },
        select: { id: true, name: true, email: true, role: true, status: true },
      })
    },
  )

  app.get(
    '/templates',
    { schema: { tags: ['settings'] }, preHandler: app.requireAuth('campaigns:read') },
    async (req) => ({
      items: await db.messageTemplate.findMany({
        where: { tenantId: req.auth!.tenantId },
        orderBy: { name: 'asc' },
      }),
    }),
  )

  app.post(
    '/templates/sync',
    { schema: { tags: ['settings'] }, preHandler: app.requireAuth('campaigns:write') },
    async (req) => {
      const remote = await app.ctx.providers.messaging.listTemplates()
      let upserted = 0
      for (const t of remote) {
        const bodyComponent = (t.components as Array<{ type?: string; text?: string }>).find(
          (c) => c.type?.toUpperCase() === 'BODY',
        )
        const variables = [...(bodyComponent?.text ?? '').matchAll(/\{\{(\d+)\}\}/g)].map(
          (m) => `var${m[1]}`,
        )
        await db.messageTemplate.upsert({
          where: {
            tenantId_name_language: {
              tenantId: req.auth!.tenantId,
              name: t.name,
              language: t.language,
            },
          },
          update: {
            status: t.status,
            category: t.category,
            components: t.components as Prisma.InputJsonValue,
            body: bodyComponent?.text ?? null,
            variables,
            qualityScore: t.qualityScore ?? null,
            providerId: t.providerId,
            lastSyncAt: new Date(),
          },
          create: {
            tenantId: req.auth!.tenantId,
            name: t.name,
            language: t.language,
            category: t.category,
            status: t.status,
            components: t.components as Prisma.InputJsonValue,
            body: bodyComponent?.text ?? null,
            variables,
            qualityScore: t.qualityScore ?? null,
            providerId: t.providerId,
            lastSyncAt: new Date(),
          },
        })
        upserted++
      }
      return { synced: upserted, provider: app.ctx.providers.messaging.name }
    },
  )

  app.get(
    '/integrations',
    { schema: { tags: ['settings'] }, preHandler: app.requireAuth('settings:read') },
    async (req) => {
      const rows = await db.integration.findMany({
        where: { tenantId: req.auth!.tenantId },
        select: {
          id: true,
          unitId: true,
          kind: true,
          name: true,
          status: true,
          config: true,
          lastError: true,
          lastSyncAt: true,
        },
      })
      return { items: rows, runtime: app.ctx.providerStatus }
    },
  )

  app.get(
    '/audit',
    {
      schema: {
        tags: ['settings'],
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(500).optional(),
          action: z.string().optional(),
        }),
      },
      preHandler: app.requireAuth('audit:read'),
    },
    async (req) => {
      const q = req.query as { limit?: number; action?: string }
      return {
        items: await db.auditLog.findMany({
          where: {
            tenantId: req.auth!.tenantId,
            ...(q.action ? { action: { startsWith: q.action } } : {}),
          },
          include: { user: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
          take: q.limit ?? 100,
        }),
      }
    },
  )

  app.get(
    '/automations',
    { schema: { tags: ['settings'] }, preHandler: app.requireAuth('settings:read') },
    async (req) => ({
      items: await db.automation.findMany({
        where: { tenantId: req.auth!.tenantId },
        include: { runs: { orderBy: { createdAt: 'desc' }, take: 5 } },
        orderBy: { createdAt: 'asc' },
      }),
    }),
  )

  app.post(
    '/automations',
    {
      schema: {
        tags: ['settings'],
        body: z.object({
          unitId: z.string().uuid().nullable().optional(),
          name: z.string().min(2),
          trigger: z.string().min(3),
          conditions: z
            .array(z.object({ field: z.string(), op: z.string(), value: z.unknown().optional() }))
            .default([]),
          actions: z.array(z.record(z.string(), z.unknown())).min(1),
          active: z.boolean().default(true),
        }),
      },
      preHandler: app.requireAuth('settings:write'),
    },
    async (req) => {
      const body = req.body as {
        unitId?: string | null
        name: string
        trigger: string
        conditions: unknown[]
        actions: unknown[]
        active: boolean
      }
      return db.automation.create({
        data: {
          tenantId: req.auth!.tenantId,
          unitId: body.unitId ?? null,
          name: body.name,
          trigger: body.trigger,
          conditions: body.conditions as Prisma.InputJsonValue,
          actions: body.actions as Prisma.InputJsonValue,
          active: body.active,
        },
      })
    },
  )

  app.patch(
    '/automations/:id',
    {
      schema: {
        tags: ['settings'],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          active: z.boolean().optional(),
          name: z.string().optional(),
          conditions: z.array(z.unknown()).optional(),
          actions: z.array(z.unknown()).optional(),
        }),
      },
      preHandler: app.requireAuth('settings:write'),
    },
    async (req) => {
      const id = (req.params as { id: string }).id
      const a = await db.automation.findFirst({ where: { id, tenantId: req.auth!.tenantId } })
      if (!a) throw new NotFoundError('Automation', id)
      const body = req.body as {
        active?: boolean
        name?: string
        conditions?: unknown[]
        actions?: unknown[]
      }
      return db.automation.update({
        where: { id },
        data: {
          active: body.active,
          name: body.name,
          conditions: body.conditions as Prisma.InputJsonValue | undefined,
          actions: body.actions as Prisma.InputJsonValue | undefined,
        },
      })
    },
  )
}
