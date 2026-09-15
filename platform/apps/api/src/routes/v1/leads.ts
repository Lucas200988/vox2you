import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import type { Prisma } from '@vox/db'
import {
  FactInputSchema,
  LeadStageChangeSchema,
  LeadUpdateSchema,
  TaskInputSchema,
} from '@vox/shared'
import {
  FollowUpService,
  LeadService,
  NotFoundError,
  PipelineService,
  TimelineService,
  createTask,
  suggestLostReason,
} from '@vox/core'

const IdParams = z.object({ id: z.string().uuid() })

export const leadRoutes: FastifyPluginAsync = async (app) => {
  const leads = new LeadService(app.ctx.db)
  const publish = (leadId: string, unitId: string, payload: Record<string, unknown>) =>
    app.ctx.realtime.publish({
      type: 'lead.updated',
      tenantId: '',
      unitId,
      leadId,
      payload,
      at: new Date().toISOString(),
    })

  app.get(
    '/leads',
    {
      schema: {
        tags: ['crm'],
        querystring: z.object({
          unitId: z.string().uuid().optional(),
          stageKey: z.string().optional(),
          stageId: z.string().uuid().optional(),
          ownerId: z.string().uuid().optional(),
          status: z.string().optional(),
          minScore: z.coerce.number().optional(),
          q: z.string().optional(),
          productId: z.string().uuid().optional(),
          tagId: z.string().uuid().optional(),
          limit: z.coerce.number().int().min(1).max(500).optional(),
        }),
      },
      preHandler: [app.requireAuth(), app.requireScope('leads:read')],
    },
    async (req) => {
      return { items: await leads.list(req.auth!, req.query as Parameters<LeadService['list']>[1]) }
    },
  )

  /** CSV of the filtered leads (contacts:export): opens in Sheets/Excel; same filters as GET /leads. */
  app.get(
    '/leads/export.csv',
    {
      schema: {
        tags: ['crm'],
        querystring: z.object({
          unitId: z.string().uuid().optional(),
          stageKey: z.string().optional(),
          ownerId: z.string().uuid().optional(),
          status: z.string().optional(),
          minScore: z.coerce.number().optional(),
          q: z.string().optional(),
        }),
      },
      preHandler: [app.requireAuth('contacts:export'), app.requireScope('leads:read')],
    },
    async (req, reply) => {
      const q = req.query as {
        unitId?: string
        stageKey?: string
        ownerId?: string
        status?: string
        minScore?: number
        q?: string
      }
      const items = await leads.list(req.auth!, { ...q, limit: 500 })
      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
      const header = [
        'nome',
        'telefone',
        'origem',
        'estagio',
        'status',
        'score',
        'responsavel',
        'produto_interesse',
        'produto_recomendado',
        'tags',
        'proxima_acao',
        'criado_em',
        'ultima_interacao',
      ]
      const rows = items.map((l) =>
        [
          l.contact.name,
          l.contact.phone,
          l.contact.source,
          l.stage.name,
          l.status,
          l.score,
          l.owner?.name,
          l.interestProduct?.name,
          l.recommendedProduct?.name,
          l.tags.map((t) => t.tag.name).join('|'),
          l.nextBestAction,
          l.createdAt.toISOString(),
          l.lastInteractionAt?.toISOString(),
        ]
          .map(esc)
          .join(';'),
      )
      const csv = '\ufeff' + [header.join(';'), ...rows].join('\r\n')
      await app.ctx.db.auditLog.create({
        data: {
          tenantId: req.auth!.tenantId,
          userId: req.auth!.userId ?? null,
          actor: req.auth!.actor,
          action: 'leads.export',
          entityType: 'lead',
          entityId: q.unitId ?? 'all',
          after: { count: items.length, filters: q } as Prisma.InputJsonValue,
        },
      })
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header(
          'content-disposition',
          `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
        )
        .send(csv)
    },
  )

  app.get(
    '/leads/kanban',
    {
      schema: { tags: ['crm'], querystring: z.object({ unitId: z.string().uuid() }) },
      preHandler: app.requireAuth('leads:read'),
    },
    async (req) => {
      return leads.kanban(req.auth!, (req.query as { unitId: string }).unitId)
    },
  )

  app.get(
    '/leads/:id',
    {
      schema: { tags: ['crm'], params: IdParams },
      preHandler: [app.requireAuth(), app.requireScope('leads:read')],
    },
    async (req) => {
      return leads.get(req.auth!, (req.params as z.infer<typeof IdParams>).id)
    },
  )

  app.patch(
    '/leads/:id',
    {
      schema: { tags: ['crm'], params: IdParams, body: LeadUpdateSchema },
      preHandler: [app.requireAuth('leads:write'), app.requireScope('leads:write')],
    },
    async (req) => {
      const body = req.body as z.infer<typeof LeadUpdateSchema>
      const id = (req.params as z.infer<typeof IdParams>).id
      const updated = await leads.update(req.auth!, id, {
        ...(body.ownerId !== undefined
          ? { owner: body.ownerId ? { connect: { id: body.ownerId } } : { disconnect: true } }
          : {}),
        ...(body.interestProductId !== undefined
          ? {
              interestProduct: body.interestProductId
                ? { connect: { id: body.interestProductId } }
                : { disconnect: true },
            }
          : {}),
        ...(body.estimatedValue !== undefined ? { estimatedValue: body.estimatedValue } : {}),
        ...(body.urgency !== undefined ? { urgency: body.urgency } : {}),
        ...(body.profileType !== undefined ? { profileType: body.profileType } : {}),
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.nextFollowupAt !== undefined
          ? { nextFollowupAt: body.nextFollowupAt ? new Date(body.nextFollowupAt) : null }
          : {}),
        ...(body.nextFollowupReason !== undefined
          ? { nextFollowupReason: body.nextFollowupReason }
          : {}),
      })
      await publish(id, updated.unitId, { fields: Object.keys(body) })
      return updated
    },
  )

  app.post(
    '/leads/:id/stage',
    {
      schema: { tags: ['crm'], params: IdParams, body: LeadStageChangeSchema },
      preHandler: app.requireAuth('leads:write'),
    },
    async (req) => {
      const body = req.body as z.infer<typeof LeadStageChangeSchema>
      const id = (req.params as z.infer<typeof IdParams>).id
      const updated = await leads.moveStage(
        req.auth!,
        id,
        { stageId: body.stageId, stageKey: body.stageKey },
        {
          reason: body.reason,
          lostReasonId: body.lostReasonId,
          lostReasonDetail: body.lostReasonDetail,
          suggestedByAi: body.suggestedByAi,
        },
      )
      await publish(id, updated.unitId, { stage: updated.stage.key })
      return updated
    },
  )

  app.post(
    '/leads/:id/auto-assign',
    { schema: { tags: ['crm'], params: IdParams }, preHandler: app.requireAuth('leads:assign') },
    async (req) => {
      return leads.autoAssign(req.auth!, (req.params as z.infer<typeof IdParams>).id)
    },
  )
  app.post(
    '/leads/:id/assign',
    {
      schema: {
        tags: ['crm'],
        params: IdParams,
        body: z.object({ ownerId: z.string().uuid().nullable() }),
      },
      preHandler: app.requireAuth('leads:assign'),
    },
    async (req) => {
      return leads.assign(
        req.auth!,
        (req.params as z.infer<typeof IdParams>).id,
        (req.body as { ownerId: string | null }).ownerId,
      )
    },
  )

  app.post(
    '/leads/:id/facts',
    {
      schema: { tags: ['crm'], params: IdParams, body: FactInputSchema },
      preHandler: app.requireAuth('leads:write'),
    },
    async (req) => {
      return leads.addFact(
        req.auth!,
        (req.params as z.infer<typeof IdParams>).id,
        req.body as z.infer<typeof FactInputSchema>,
      )
    },
  )

  app.delete(
    '/leads/:id/facts/:factId',
    {
      schema: { tags: ['crm'], params: IdParams.extend({ factId: z.string().uuid() }) },
      preHandler: app.requireAuth('leads:write'),
    },
    async (req) => {
      const p = req.params as { id: string; factId: string }
      return leads.rejectFact(req.auth!, p.id, p.factId)
    },
  )

  app.post(
    '/leads/:id/notes',
    {
      schema: { tags: ['crm'], params: IdParams, body: z.object({ body: z.string().min(1) }) },
      preHandler: app.requireAuth('leads:write'),
    },
    async (req) => {
      return leads.addNote(
        req.auth!,
        (req.params as z.infer<typeof IdParams>).id,
        (req.body as { body: string }).body,
      )
    },
  )

  app.post(
    '/leads/:id/tags',
    {
      schema: { tags: ['crm'], params: IdParams, body: z.object({ name: z.string().min(1) }) },
      preHandler: app.requireAuth('leads:write'),
    },
    async (req) => {
      return leads.addTag(
        req.auth!,
        (req.params as z.infer<typeof IdParams>).id,
        (req.body as { name: string }).name,
      )
    },
  )

  app.delete(
    '/leads/:id/tags/:tagId',
    {
      schema: { tags: ['crm'], params: IdParams.extend({ tagId: z.string().uuid() }) },
      preHandler: app.requireAuth('leads:write'),
    },
    async (req) => {
      const p = req.params as { id: string; tagId: string }
      await leads.removeTag(req.auth!, p.id, p.tagId)
      return { ok: true }
    },
  )

  app.get(
    '/leads/:id/lost-suggestion',
    { schema: { tags: ['crm'], params: IdParams }, preHandler: app.requireAuth('leads:read') },
    async (req) => {
      return {
        suggestion: await suggestLostReason(
          app.ctx.db,
          req.auth!,
          (req.params as z.infer<typeof IdParams>).id,
        ),
      }
    },
  )
  app.get(
    '/leads/:id/timeline',
    { schema: { tags: ['crm'], params: IdParams }, preHandler: app.requireAuth('leads:read') },
    async (req) => {
      return {
        items: await new TimelineService(app.ctx.db).forLead(
          req.auth!,
          (req.params as z.infer<typeof IdParams>).id,
        ),
      }
    },
  )

  app.get(
    '/leads/:id/followups',
    { schema: { tags: ['crm'], params: IdParams }, preHandler: app.requireAuth('leads:read') },
    async (req) => {
      return {
        items: await new FollowUpService(app.ctx.db).listForLead(
          req.auth!,
          (req.params as z.infer<typeof IdParams>).id,
        ),
      }
    },
  )

  app.post(
    '/leads/:id/followups/:followUpId/cancel',
    {
      schema: { tags: ['crm'], params: IdParams.extend({ followUpId: z.string().uuid() }) },
      preHandler: app.requireAuth('leads:write'),
    },
    async (req) => {
      const p = req.params as { id: string; followUpId: string }
      const fu = await app.ctx.db.followUp.findFirst({
        where: { id: p.followUpId, leadId: p.id, tenantId: req.auth!.tenantId },
      })
      if (!fu) throw new NotFoundError('FollowUp', p.followUpId)
      return app.ctx.db.followUp.update({
        where: { id: fu.id },
        data: { status: 'cancelled', skipReason: `user:${req.auth!.userId}` },
      })
    },
  )

  app.get(
    '/pipelines',
    { schema: { tags: ['crm'] }, preHandler: app.requireAuth('leads:read') },
    async (req) => {
      return { items: await new PipelineService(app.ctx.db).list(req.auth!) }
    },
  )

  app.patch(
    '/pipelines/:id/stages/:stageId',
    {
      schema: {
        tags: ['crm'],
        params: z.object({ id: z.string().uuid(), stageId: z.string().uuid() }),
        body: z.object({
          name: z.string().min(1).max(60).optional(),
          color: z.string().max(20).nullable().optional(),
          probability: z.number().min(0).max(1).optional(),
          maxHoursInStage: z
            .number()
            .int()
            .min(1)
            .max(24 * 90)
            .nullable()
            .optional(),
        }),
      },
      preHandler: app.requireAuth('settings:write'),
    },
    async (req) => {
      const { id, stageId } = req.params as { id: string; stageId: string }
      return new PipelineService(app.ctx.db).updateStage(
        req.auth!,
        id,
        stageId,
        req.body as {
          name?: string
          color?: string | null
          probability?: number
          maxHoursInStage?: number | null
        },
      )
    },
  )
  app.get(
    '/lost-reasons',
    { schema: { tags: ['crm'] }, preHandler: app.requireAuth('leads:read') },
    async (req) => {
      return {
        items: await app.ctx.db.lostReason.findMany({
          where: { tenantId: req.auth!.tenantId, active: true },
          orderBy: { order: 'asc' },
        }),
      }
    },
  )

  // Tasks
  app.get(
    '/tasks',
    {
      schema: {
        tags: ['crm'],
        querystring: z.object({
          assigneeId: z.string().uuid().optional(),
          status: z.enum(['open', 'done', 'cancelled']).optional(),
          leadId: z.string().uuid().optional(),
        }),
      },
      preHandler: app.requireAuth('leads:read'),
    },
    async (req) => {
      const q = req.query as { assigneeId?: string; status?: string; leadId?: string }
      return {
        items: await app.ctx.db.task.findMany({
          where: {
            tenantId: req.auth!.tenantId,
            status: q.status ?? 'open',
            ...(q.assigneeId ? { assigneeId: q.assigneeId } : {}),
            ...(q.leadId ? { leadId: q.leadId } : {}),
          },
          include: {
            lead: { select: { id: true, contact: { select: { name: true, phone: true } } } },
            assignee: { select: { id: true, name: true } },
          },
          orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }],
          take: 200,
        }),
      }
    },
  )

  app.post(
    '/tasks',
    {
      schema: { tags: ['crm'], body: TaskInputSchema },
      preHandler: app.requireAuth('leads:write'),
    },
    async (req) => {
      const body = req.body as z.infer<typeof TaskInputSchema>
      return createTask(app.ctx.db, {
        data: {
          tenantId: req.auth!.tenantId,
          leadId: body.leadId ?? null,
          assigneeId: body.assigneeId ?? req.auth!.userId ?? null,
          title: body.title,
          description: body.description ?? null,
          kind: body.kind,
          priority: body.priority,
          dueAt: body.dueAt ? new Date(body.dueAt) : null,
          createdBy: req.auth!.actor,
        },
      })
    },
  )

  app.post(
    '/tasks/:id/complete',
    { schema: { tags: ['crm'], params: IdParams }, preHandler: app.requireAuth('leads:write') },
    async (req) => {
      const id = (req.params as z.infer<typeof IdParams>).id
      const task = await app.ctx.db.task.findFirst({ where: { id, tenantId: req.auth!.tenantId } })
      if (!task) throw new NotFoundError('Task', id)
      return app.ctx.db.task.update({
        where: { id },
        data: { status: 'done', completedAt: new Date() },
      })
    },
  )
}
