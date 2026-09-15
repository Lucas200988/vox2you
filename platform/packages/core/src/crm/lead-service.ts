import type { Db, DbTx, Prisma } from '@vox/db'
import { pickOwner } from './assignment.js'
import { emitEvent } from '../events/outbox.js'
import { NotFoundError, ValidationError } from '../errors.js'
import { assertUnitAccess, unitScope, type TenantContext } from '../tenant/context.js'
import { PipelineService } from './pipeline-service.js'

export interface FactUpsert {
  key: string
  value: string
  source?: 'stated' | 'inferred' | 'confirmed' | 'imported'
  confidence?: number
  evidenceMessageId?: string | null
}

const STAGE_ORDER = ['new', 'conversing', 'discovery', 'qualified', 'offer', 'scheduling', 'negotiation']

export class LeadService {
  constructor(private readonly db: Db) {}

  /** Returns the open lead for a contact in a unit or creates one in the first stage. */
  async getOrCreateOpen(tx: DbTx, ctx: TenantContext, params: { unitId: string; contactId: string; source?: string }) {
    const existing = await tx.lead.findFirst({
      where: { tenantId: ctx.tenantId, unitId: params.unitId, contactId: params.contactId, status: 'open' },
      include: { stage: true },
    })
    if (existing) return { lead: existing, created: false }

    const pipeline = await tx.pipeline.findFirst({
      where: { tenantId: ctx.tenantId, OR: [{ unitId: params.unitId }, { unitId: null }], isDefault: true },
      include: { stages: { orderBy: { order: 'asc' } } },
      orderBy: { unitId: 'desc' },
    })
    if (!pipeline || !pipeline.stages[0]) throw new NotFoundError('Default pipeline')
    const firstStage = pipeline.stages.find((s) => s.key === 'new') ?? pipeline.stages[0]

    const lead = await tx.lead.create({
      data: {
        tenantId: ctx.tenantId,
        unitId: params.unitId,
        contactId: params.contactId,
        pipelineId: pipeline.id,
        stageId: firstStage.id,
        probability: firstStage.probability,
        status: 'open',
        stageEnteredAt: new Date(),
        lastInteractionAt: new Date(),
      },
      include: { stage: true },
    })
    await tx.leadStageHistory.create({ data: { leadId: lead.id, toStageId: firstStage.id, changedBy: ctx.actor, reason: 'created' } })
    await emitEvent(tx, {
      type: 'lead.created',
      tenantId: ctx.tenantId,
      unitId: params.unitId,
      aggregateType: 'lead',
      aggregateId: lead.id,
      payload: { contactId: params.contactId, source: params.source ?? null, stage: firstStage.key },
      actor: ctx.actor,
    })
    return { lead, created: true }
  }

  async get(ctx: TenantContext, id: string) {
    const lead = await this.db.lead.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        contact: { include: { company: true, consents: true, identities: true, attribution: { orderBy: { createdAt: 'desc' }, take: 3 } } },
        stage: true,
        pipeline: { include: { stages: { orderBy: { order: 'asc' } } } },
        owner: { select: { id: true, name: true } },
        recommendedOwner: { select: { id: true, name: true } },
        interestProduct: true,
        recommendedProduct: true,
        facts: { orderBy: { updatedAt: 'desc' } },
        scoreSnapshots: { orderBy: { createdAt: 'desc' }, take: 1 },
        stageHistory: { orderBy: { createdAt: 'asc' }, include: {} },
        tasks: { where: { status: 'open' }, orderBy: { dueAt: 'asc' } },
        tags: { include: { tag: true } },
        deals: { orderBy: { createdAt: 'desc' } },
        followUps: { where: { status: 'scheduled' }, orderBy: { scheduledAt: 'asc' } },
        appointments: { orderBy: { startsAt: 'desc' }, take: 5 },
        notes: { orderBy: { createdAt: 'desc' }, include: { author: { select: { name: true } } } },
        conversations: { select: { id: true, mode: true, status: true, summary: true, lastMessageAt: true }, orderBy: { lastMessageAt: 'desc' } },
        lostReason: true,
      },
    })
    if (!lead) throw new NotFoundError('Lead', id)
    assertUnitAccess(ctx, lead.unitId)
    return lead
  }

  async list(ctx: TenantContext, filters: { unitId?: string; stageId?: string; stageKey?: string; ownerId?: string; status?: string; minScore?: number; q?: string; productId?: string; tagId?: string; limit?: number }) {
    const where: Prisma.LeadWhereInput = {
      tenantId: ctx.tenantId,
      ...unitScope(ctx),
      ...(filters.unitId ? { unitId: filters.unitId } : {}),
      ...(filters.stageId ? { stageId: filters.stageId } : {}),
      ...(filters.stageKey ? { stage: { key: filters.stageKey } } : {}),
      ...(filters.ownerId ? { ownerId: filters.ownerId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.minScore !== undefined ? { score: { gte: filters.minScore } } : {}),
      ...(filters.productId ? { OR: [{ interestProductId: filters.productId }, { recommendedProductId: filters.productId }] } : {}),
      ...(filters.tagId ? { tags: { some: { tagId: filters.tagId } } } : {}),
      ...(filters.q ? { contact: { OR: [{ name: { contains: filters.q, mode: 'insensitive' } }, { phone: { contains: filters.q.replace(/\D/g, '') } }] } } : {}),
    }
    return this.db.lead.findMany({
      where,
      include: {
        contact: { select: { id: true, name: true, phone: true, source: true, profileType: true } },
        stage: true,
        owner: { select: { id: true, name: true } },
        interestProduct: { select: { id: true, name: true } },
        recommendedProduct: { select: { id: true, name: true } },
        tags: { include: { tag: true } },
      },
      orderBy: [{ score: 'desc' }, { lastInteractionAt: 'desc' }],
      take: filters.limit ?? 200,
    })
  }

  /** Kanban view: leads grouped by stage for a unit's default pipeline. */
  async kanban(ctx: TenantContext, unitId: string) {
    assertUnitAccess(ctx, unitId)
    const pipeline = await new PipelineService(this.db).getDefaultPipeline(ctx, unitId)
    const leads = await this.list(ctx, { unitId, limit: 500 })
    const columns = pipeline.stages.map((stage) => ({
      stage,
      leads: leads.filter((l) => l.stageId === stage.id),
    }))
    return { pipeline: { id: pipeline.id, name: pipeline.name }, columns }
  }

  async moveStage(ctx: TenantContext, leadId: string, target: { stageId?: string; stageKey?: string }, opts: { reason?: string; lostReasonId?: string; lostReasonDetail?: string; suggestedByAi?: boolean } = {}) {
    return this.db.$transaction((tx) => LeadService.moveStageTx(tx, ctx, leadId, target, opts))
  }

  static async moveStageTx(tx: DbTx, ctx: TenantContext, leadId: string, target: { stageId?: string; stageKey?: string }, opts: { reason?: string; lostReasonId?: string; lostReasonDetail?: string; suggestedByAi?: boolean } = {}) {
    const lead = await tx.lead.findFirst({ where: { id: leadId, tenantId: ctx.tenantId }, include: { stage: true } })
    if (!lead) throw new NotFoundError('Lead', leadId)
    const stage = target.stageId
      ? await tx.pipelineStage.findFirst({ where: { id: target.stageId, pipelineId: lead.pipelineId } })
      : await tx.pipelineStage.findFirst({ where: { key: target.stageKey ?? '', pipelineId: lead.pipelineId } })
    if (!stage) throw new ValidationError('Stage not found in lead pipeline')
    if (stage.id === lead.stageId) return lead

    const now = new Date()
    const statusByKind: Record<string, string> = { open: 'open', won: 'won', lost: 'lost', nurture: 'nurture' }
    const updated = await tx.lead.update({
      where: { id: leadId },
      data: {
        stageId: stage.id,
        status: statusByKind[stage.kind] ?? 'open',
        probability: stage.probability,
        stageEnteredAt: now,
        ...(stage.key === 'qualified' && !lead.qualifiedAt ? { qualifiedAt: now } : {}),
        ...(stage.kind === 'won' ? { wonAt: now } : {}),
        ...(stage.kind === 'lost'
          ? { lostAt: now, lostReasonId: opts.lostReasonId ?? null, lostReasonDetail: opts.lostReasonDetail ?? null, lostReasonSuggestedByAi: opts.suggestedByAi ?? false, lostReasonConfirmed: !opts.suggestedByAi }
          : {}),
      },
      include: { stage: true },
    })
    await tx.leadStageHistory.create({ data: { leadId, fromStageId: lead.stageId, toStageId: stage.id, changedBy: ctx.actor, reason: opts.reason ?? null } })
    await emitEvent(tx, {
      type: 'stage.changed',
      tenantId: ctx.tenantId,
      unitId: lead.unitId,
      aggregateType: 'lead',
      aggregateId: leadId,
      payload: { from: lead.stage.key, to: stage.key, reason: opts.reason ?? null, contactId: lead.contactId },
      actor: ctx.actor,
    })
    if (stage.key === 'qualified' && lead.stage.key !== 'qualified') {
      await emitEvent(tx, { type: 'lead.qualified', tenantId: ctx.tenantId, unitId: lead.unitId, aggregateType: 'lead', aggregateId: leadId, payload: { contactId: lead.contactId, score: lead.score }, actor: ctx.actor })
    }
    if (stage.kind === 'won') {
      await emitEvent(tx, { type: 'lead.won', tenantId: ctx.tenantId, unitId: lead.unitId, aggregateType: 'lead', aggregateId: leadId, payload: { contactId: lead.contactId }, actor: ctx.actor })
    }
    if (stage.kind === 'lost') {
      await emitEvent(tx, { type: 'lead.lost', tenantId: ctx.tenantId, unitId: lead.unitId, aggregateType: 'lead', aggregateId: leadId, payload: { contactId: lead.contactId, lostReasonId: opts.lostReasonId ?? null, suggestedByAi: opts.suggestedByAi ?? false }, actor: ctx.actor })
    }
    return updated
  }

  /** Only moves forward in the funnel (never regresses automatically). */
  static async advanceStageTx(tx: DbTx, ctx: TenantContext, leadId: string, stageKey: string, reason: string) {
    const lead = await tx.lead.findFirst({ where: { id: leadId, tenantId: ctx.tenantId }, include: { stage: true } })
    if (!lead) return null
    const currentIdx = STAGE_ORDER.indexOf(lead.stage.key)
    const targetIdx = STAGE_ORDER.indexOf(stageKey)
    if (targetIdx < 0 || targetIdx <= currentIdx) return lead
    return LeadService.moveStageTx(tx, ctx, leadId, { stageKey }, { reason })
  }

  /** Upserts structured facts; "stated"/"confirmed" beat "inferred"; conflicting values mark the old one stale. */
  static async upsertFactsTx(tx: DbTx, ctx: TenantContext, leadId: string, facts: FactUpsert[]) {
    const captured: Array<{ key: string; value: string }> = []
    const rank = { imported: 1, inferred: 1, stated: 2, confirmed: 3 } as const
    for (const fact of facts) {
      const source = fact.source ?? 'stated'
      const active = await tx.leadFact.findMany({ where: { leadId, key: fact.key, status: 'active' } })
      const same = active.find((f) => f.value.trim().toLowerCase() === fact.value.trim().toLowerCase())
      if (same) {
        if (rank[source] > rank[same.source as keyof typeof rank]) {
          await tx.leadFact.update({ where: { id: same.id }, data: { source, confidence: Math.max(same.confidence, fact.confidence ?? 0.8) } })
        }
        continue
      }
      // Multi-valued keys (pain, objection) accumulate; single-valued keys supersede
      const multi = ['pain', 'objection', 'interest_product'].includes(fact.key)
      if (!multi && active.length) {
        const stronger = active.some((f) => rank[f.source as keyof typeof rank] > rank[source])
        if (stronger) continue
        await tx.leadFact.updateMany({ where: { id: { in: active.map((f) => f.id) } }, data: { status: 'stale' } })
      }
      await tx.leadFact.create({
        data: { tenantId: ctx.tenantId, leadId, key: fact.key, value: fact.value, source, confidence: fact.confidence ?? 0.8, evidenceMessageId: fact.evidenceMessageId ?? null },
      })
      captured.push({ key: fact.key, value: fact.value })
    }
    if (captured.length) {
      const lead = await tx.lead.findUnique({ where: { id: leadId }, select: { unitId: true, contactId: true } })
      await emitEvent(tx, { type: 'fact.captured', tenantId: ctx.tenantId, unitId: lead?.unitId, aggregateType: 'lead', aggregateId: leadId, payload: { facts: captured, contactId: lead?.contactId }, actor: ctx.actor })
    }
    return captured
  }

  async addFact(ctx: TenantContext, leadId: string, fact: FactUpsert) {
    await this.get(ctx, leadId)
    return this.db.$transaction((tx) => LeadService.upsertFactsTx(tx, ctx, leadId, [fact]))
  }

  async rejectFact(ctx: TenantContext, leadId: string, factId: string) {
    await this.get(ctx, leadId)
    return this.db.leadFact.update({ where: { id: factId }, data: { status: 'rejected' } })
  }

  async update(ctx: TenantContext, leadId: string, data: Prisma.LeadUpdateInput) {
    await this.get(ctx, leadId)
    return this.db.lead.update({ where: { id: leadId }, data })
  }

  async assign(ctx: TenantContext, leadId: string, ownerId: string | null) {
    const lead = await this.get(ctx, leadId)
    return this.db.$transaction(async (tx) => {
      const updated = await tx.lead.update({ where: { id: leadId }, data: { ownerId } })
      await tx.conversation.updateMany({ where: { leadId, status: 'open' }, data: { assigneeId: ownerId } })
      await emitEvent(tx, { type: 'lead.updated', tenantId: ctx.tenantId, unitId: lead.unitId, aggregateType: 'lead', aggregateId: leadId, payload: { ownerId }, actor: ctx.actor })
      return updated
    })
  }

  /** Assigns the least-loaded eligible user of the lead's unit (round-robin); no-op when nobody is eligible. */
  async autoAssign(ctx: TenantContext, leadId: string) {
    const lead = await this.get(ctx, leadId)
    const ownerId = await this.db.$transaction((tx) => pickOwner(tx, lead.unitId, { excludeUserIds: lead.ownerId ? [lead.ownerId] : [] }))
    if (!ownerId) return { assigned: false as const, ownerId: null, lead }
    const updated = await this.assign(ctx, leadId, ownerId)
    return { assigned: true as const, ownerId, lead: updated }
  }

  async addNote(ctx: TenantContext, leadId: string, body: string) {
    const lead = await this.get(ctx, leadId)
    return this.db.note.create({ data: { tenantId: ctx.tenantId, leadId, contactId: lead.contactId, authorId: ctx.userId ?? null, body } })
  }

  async addTag(ctx: TenantContext, leadId: string, tagName: string) {
    const lead = await this.get(ctx, leadId)
    return this.db.$transaction(async (tx) => {
      const tag = await tx.tag.upsert({ where: { tenantId_name: { tenantId: ctx.tenantId, name: tagName } }, update: {}, create: { tenantId: ctx.tenantId, name: tagName } })
      await tx.leadTag.upsert({ where: { leadId_tagId: { leadId, tagId: tag.id } }, update: {}, create: { leadId, tagId: tag.id } })
      await emitEvent(tx, { type: 'tag.added', tenantId: ctx.tenantId, unitId: lead.unitId, aggregateType: 'lead', aggregateId: leadId, payload: { tag: tagName }, actor: ctx.actor })
      return tag
    })
  }

  async removeTag(ctx: TenantContext, leadId: string, tagId: string) {
    await this.get(ctx, leadId)
    await this.db.leadTag.deleteMany({ where: { leadId, tagId } })
  }
}
