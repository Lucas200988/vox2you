import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import type { Prisma } from '@vox/db'
import { AgentSettingsInputSchema, ROLES } from '@vox/shared'
import { checkIntegration } from '@vox/providers'
import {
  DEFAULT_SCORING_WEIGHTS,
  NotFoundError,
  ValidationError,
  hashPassword,
  integrationKind,
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
          email: z.string().optional(),
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

  // ─── Integrations (CRM-managed credentials; secrets encrypted at rest, never returned) ───
  const KindParams = z.object({ kind: z.string().min(1) })
  const IntegrationBody = z.object({
    unitId: z.string().uuid().optional(),
    values: z.record(z.string(), z.string()),
  })
  const assertUnit = async (tenantId: string, unitId?: string) => {
    if (!unitId) return
    const unit = await db.unit.findFirst({ where: { id: unitId, tenantId }, select: { id: true } })
    if (!unit) throw new NotFoundError('Unit', unitId)
  }
  const scopedUnit = (kind: string, unitId?: string): string | null =>
    integrationKind(kind)?.scope === 'unit' ? (unitId ?? null) : null

  app.get(
    '/integrations',
    {
      schema: {
        tags: ['settings'],
        querystring: z.object({ unitId: z.string().uuid().optional() }),
      },
      preHandler: app.requireAuth('settings:read'),
    },
    async (req) => {
      const { unitId } = req.query as { unitId?: string }
      const tenantId = req.auth!.tenantId
      const [items, resolved] = await Promise.all([
        app.ctx.integrations.list(tenantId, unitId),
        app.ctx.resolver.resolve(tenantId),
      ])
      return {
        kinds: app.ctx.integrations.kinds(),
        items,
        runtime: resolved.status,
        processRuntime: app.ctx.providerStatus,
      }
    },
  )

  app.put(
    '/integrations/:kind',
    {
      schema: { tags: ['settings'], params: KindParams, body: IntegrationBody },
      preHandler: app.requireAuth('settings:write'),
    },
    async (req) => {
      const { kind } = req.params as z.infer<typeof KindParams>
      const { unitId, values } = req.body as z.infer<typeof IntegrationBody>
      const tenantId = req.auth!.tenantId
      await assertUnit(tenantId, unitId)
      const view = await app.ctx.integrations.save(tenantId, kind, scopedUnit(kind, unitId), values)
      app.ctx.resolver.invalidate(tenantId)
      // Audit what changed, never the values
      await db.auditLog.create({
        data: {
          tenantId,
          userId: req.auth!.userId ?? null,
          actor: req.auth!.actor,
          action: 'integration.save',
          entityType: 'integration',
          entityId: view.id,
          after: {
            kind,
            unitId: view.unitId,
            fields: Object.keys(values),
          } as Prisma.InputJsonValue,
        },
      })
      return view
    },
  )

  app.post(
    '/integrations/:kind/test',
    {
      schema: {
        tags: ['settings'],
        params: KindParams,
        body: z.object({ unitId: z.string().uuid().optional() }).default({}),
      },
      preHandler: app.requireAuth('settings:write'),
    },
    async (req) => {
      const { kind } = req.params as z.infer<typeof KindParams>
      const { unitId } = (req.body ?? {}) as { unitId?: string }
      const tenantId = req.auth!.tenantId
      const loaded = await app.ctx.integrations.values(tenantId, kind, scopedUnit(kind, unitId))
      if (!loaded) throw new NotFoundError('Integration', kind)
      const result = await checkIntegration(kind, loaded.values)
      await app.ctx.integrations.setStatus(
        loaded.row.id,
        result.ok ? 'connected' : 'error',
        result.ok ? null : result.message,
      )
      app.ctx.resolver.invalidate(tenantId)
      return result
    },
  )

  app.delete(
    '/integrations/:kind',
    {
      schema: {
        tags: ['settings'],
        params: KindParams,
        querystring: z.object({ unitId: z.string().uuid().optional() }),
      },
      preHandler: app.requireAuth('settings:write'),
    },
    async (req) => {
      const { kind } = req.params as z.infer<typeof KindParams>
      const { unitId } = req.query as { unitId?: string }
      const tenantId = req.auth!.tenantId
      await app.ctx.integrations.remove(tenantId, kind, scopedUnit(kind, unitId))
      app.ctx.resolver.invalidate(tenantId)
      await db.auditLog.create({
        data: {
          tenantId,
          userId: req.auth!.userId ?? null,
          actor: req.auth!.actor,
          action: 'integration.remove',
          entityType: 'integration',
          entityId: kind,
          after: { kind, unitId: unitId ?? null } as Prisma.InputJsonValue,
        },
      })
      return { ok: true }
    },
  )

  /** Go-live checklist for a unit: what is configured, what is still missing before the pilot. */
  app.get(
    '/setup-status',
    {
      schema: { tags: ['settings'], querystring: UnitQuery },
      preHandler: app.requireAuth('settings:read'),
    },
    async (req) => {
      const { unitId } = req.query as { unitId: string }
      const tenantId = req.auth!.tenantId
      const unit = await db.unit.findFirst({ where: { id: unitId, tenantId } })
      if (!unit) throw new NotFoundError('Unit', unitId)
      const [resolved, integrations, agent, docs, products, templates, users] = await Promise.all([
        app.ctx.resolver.resolve(tenantId),
        app.ctx.integrations.list(tenantId, unitId),
        db.agentSettings.findUnique({ where: { unitId } }),
        db.knowledgeDocument.count({ where: { tenantId, ingestStatus: 'ready' } }),
        db.product.count({ where: { tenantId } }),
        db.messageTemplate.count({ where: { tenantId } }),
        db.user.count({ where: { tenantId, status: 'active' } }),
      ])
      const rt = resolved.status
      const has = (kind: string) =>
        integrations.find((i) => i.kind === kind && (i.unitId === null || i.unitId === unitId))
      const connected = (kind: string) => has(kind)?.status === 'connected'
      const extra = (agent?.extra as { salesMode?: string } | null) ?? {}
      const salesMode = extra.salesMode === 'closer' ? 'closer' : 'sdr'
      const hoursSet =
        ((agent?.businessHours as { rules?: unknown[] } | null)?.rules ?? []).length > 0
      const items = [
        {
          key: 'unit_profile',
          label: 'Dados da unidade (endereço e telefone aparecem na confirmação da visita)',
          required: true,
          ok: !!(unit.address && unit.phone),
          detail: unit.address ? unit.address : 'sem endereço',
          tab: 'unit',
        },
        {
          key: 'whatsapp',
          label: 'WhatsApp Business (Meta) conectado',
          required: true,
          ok: connected('whatsapp_meta') || rt.messaging === 'meta',
          detail: has('whatsapp_meta')
            ? `status: ${has('whatsapp_meta')!.status}`
            : `provider atual: ${rt.messaging}`,
          tab: 'integrations',
        },
        {
          key: 'llm',
          label: 'Modelo de IA (Anthropic)',
          required: true,
          ok: rt.llm !== 'mock',
          detail: `provider atual: ${rt.llm}`,
          tab: 'integrations',
        },
        {
          key: 'embedding',
          label: 'Embeddings e transcrição de áudio (OpenAI)',
          required: true,
          ok: rt.embedding !== 'hash',
          detail: `embeddings: ${rt.embedding} · áudio: ${rt.stt}`,
          tab: 'integrations',
        },
        {
          key: 'agent',
          label: 'Agente configurado (modo de venda, nome, persona)',
          required: true,
          ok: !!agent,
          detail: `modo: ${salesMode}`,
          tab: 'agent',
        },
        {
          key: 'business_hours',
          label: 'Horário de atendimento da unidade',
          required: true,
          ok: hoursSet,
          detail: hoursSet ? 'definido' : 'sem horários: a agenda interna não gera slots de visita',
          tab: 'agent',
        },
        {
          key: 'calendar',
          label: 'Agenda para visitas',
          required: true,
          ok: connected('google_calendar') || (rt.calendar === 'internal' && hoursSet),
          detail: connected('google_calendar') ? 'Google Calendar' : `agenda ${rt.calendar}`,
          tab: 'integrations',
        },
        {
          key: 'knowledge',
          label: 'Base de conhecimento publicada',
          required: true,
          ok: docs > 0,
          detail: `${docs} documento(s) prontos`,
          tab: 'knowledge',
        },
        {
          key: 'products',
          label: 'Catálogo de programas (preços só são usados em modo closer)',
          required: salesMode === 'closer',
          ok: products > 0,
          detail: `${products} produto(s)`,
          tab: 'products',
        },
        {
          key: 'templates',
          label: 'Templates aprovados pela Meta (follow-up fora da janela de 24h)',
          required: false,
          ok: templates > 0,
          detail: `${templates} template(s)`,
          tab: 'integrations',
        },
        {
          key: 'team',
          label: 'Consultores cadastrados para assumir conversas',
          required: false,
          ok: users > 1,
          detail: `${users} usuário(s)`,
          tab: 'users',
        },
      ]
      return { salesMode, items, ready: items.every((i) => !i.required || i.ok) }
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
