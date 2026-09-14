import type { Db } from '@vox/db'
import { sql } from '@vox/db'
import type { TenantContext } from '../tenant/context.js'

export interface DashboardRange {
  from: Date
  to: Date
  unitId?: string
}

/** Executive + conversational + AI metrics. All derived from persisted entities and domain events. */
export class AnalyticsService {
  constructor(private readonly db: Db) {}

  async dashboard(ctx: TenantContext, range: DashboardRange) {
    const tenantId = ctx.tenantId
    const unitFilter = range.unitId ? sql`AND unit_id = ${range.unitId}::uuid` : sql``
    const leadWhere = { tenantId, ...(range.unitId ? { unitId: range.unitId } : {}), createdAt: { gte: range.from, lte: range.to } }

    const [leads, qualified, won, lost, appointments, completedAppts, byStage, bySource, byProduct, convStats, aiStats, handoffs, followups, optOuts, responseTimes, agentRunsByDecision] = await Promise.all([
      this.db.lead.count({ where: leadWhere }),
      this.db.lead.count({ where: { ...leadWhere, qualifiedAt: { not: null } } }),
      this.db.lead.count({ where: { tenantId, ...(range.unitId ? { unitId: range.unitId } : {}), wonAt: { gte: range.from, lte: range.to } } }),
      this.db.lead.count({ where: { tenantId, ...(range.unitId ? { unitId: range.unitId } : {}), lostAt: { gte: range.from, lte: range.to } } }),
      this.db.appointment.count({ where: { tenantId, ...(range.unitId ? { unitId: range.unitId } : {}), createdAt: { gte: range.from, lte: range.to } } }),
      this.db.appointment.count({ where: { tenantId, ...(range.unitId ? { unitId: range.unitId } : {}), status: 'completed', startsAt: { gte: range.from, lte: range.to } } }),
      this.db.lead.groupBy({ by: ['stageId'], where: { tenantId, ...(range.unitId ? { unitId: range.unitId } : {}), status: 'open' }, _count: { _all: true } }),
      this.db.$queryRaw<Array<{ source: string | null; count: number }>>(sql`
        SELECT c.source, COUNT(*)::int AS count FROM leads l JOIN contacts c ON c.id = l.contact_id
        WHERE l.tenant_id = ${tenantId}::uuid AND l.created_at BETWEEN ${range.from} AND ${range.to} ${range.unitId ? sql`AND l.unit_id = ${range.unitId}::uuid` : sql``}
        GROUP BY c.source ORDER BY count DESC LIMIT 10`),
      this.db.$queryRaw<Array<{ product: string | null; leads: number; won: number }>>(sql`
        SELECT p.name AS product, COUNT(*)::int AS leads, COUNT(*) FILTER (WHERE l.status = 'won')::int AS won
        FROM leads l LEFT JOIN products p ON p.id = COALESCE(l.interest_product_id, l.recommended_product_id)
        WHERE l.tenant_id = ${tenantId}::uuid AND l.created_at BETWEEN ${range.from} AND ${range.to} ${range.unitId ? sql`AND l.unit_id = ${range.unitId}::uuid` : sql``}
        GROUP BY p.name ORDER BY leads DESC LIMIT 10`),
      this.db.$queryRaw<Array<{ total: number; ai_only: number; human: number; avg_messages: number }>>(sql`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE handoff_at IS NULL)::int AS ai_only,
               COUNT(*) FILTER (WHERE handoff_at IS NOT NULL)::int AS human,
               COALESCE(AVG((SELECT COUNT(*) FROM messages m WHERE m.conversation_id = cv.id)), 0)::float AS avg_messages
        FROM conversations cv WHERE cv.tenant_id = ${tenantId}::uuid AND cv.created_at BETWEEN ${range.from} AND ${range.to} ${unitFilter}`),
      this.db.$queryRaw<Array<{ runs: number; cost: number; input_tokens: number; output_tokens: number; avg_latency: number; avg_confidence: number | null; blocked: number }>>(sql`
        SELECT COUNT(*)::int AS runs, COALESCE(SUM(cost_usd),0)::float AS cost, COALESCE(SUM(input_tokens),0)::int AS input_tokens, COALESCE(SUM(output_tokens),0)::int AS output_tokens,
               COALESCE(AVG(latency_ms),0)::float AS avg_latency, AVG(confidence)::float AS avg_confidence,
               COUNT(*) FILTER (WHERE decision = 'blocked')::int AS blocked
        FROM agent_runs WHERE tenant_id = ${tenantId}::uuid AND kind = 'reply' AND created_at BETWEEN ${range.from} AND ${range.to} ${unitFilter}`),
      this.db.domainEvent.count({ where: { tenantId, type: 'handoff.requested', occurredAt: { gte: range.from, lte: range.to }, ...(range.unitId ? { unitId: range.unitId } : {}) } }),
      this.db.followUp.groupBy({ by: ['status'], where: { tenantId, createdAt: { gte: range.from, lte: range.to } }, _count: { _all: true } }),
      this.db.domainEvent.count({ where: { tenantId, type: 'consent.revoked', occurredAt: { gte: range.from, lte: range.to } } }),
      this.db.$queryRaw<Array<{ first_response_sec: number | null; avg_response_sec: number | null }>>(sql`
        WITH pairs AS (
          SELECT m.conversation_id, m.created_at AS inbound_at,
                 (SELECT MIN(o.created_at) FROM messages o WHERE o.conversation_id = m.conversation_id AND o.direction = 'outbound' AND o.created_at > m.created_at) AS reply_at,
                 ROW_NUMBER() OVER (PARTITION BY m.conversation_id ORDER BY m.created_at) AS rn
          FROM messages m JOIN conversations cv ON cv.id = m.conversation_id
          WHERE m.tenant_id = ${tenantId}::uuid AND m.direction = 'inbound' AND m.created_at BETWEEN ${range.from} AND ${range.to} ${range.unitId ? sql`AND cv.unit_id = ${range.unitId}::uuid` : sql``}
        )
        SELECT AVG(EXTRACT(EPOCH FROM (reply_at - inbound_at))) FILTER (WHERE rn = 1)::float AS first_response_sec,
               AVG(EXTRACT(EPOCH FROM (reply_at - inbound_at)))::float AS avg_response_sec
        FROM pairs WHERE reply_at IS NOT NULL`),
      this.db.agentRun.groupBy({ by: ['decision'], where: { tenantId, kind: 'reply', createdAt: { gte: range.from, lte: range.to } }, _count: { _all: true } }),
    ])

    const stages = await this.db.pipelineStage.findMany({ where: { id: { in: byStage.map((s) => s.stageId) } }, select: { id: true, key: true, name: true, order: true } })
    const conv = convStats[0]
    const ai = aiStats[0]
    return {
      range,
      commercial: {
        leads,
        qualified,
        qualificationRate: leads ? qualified / leads : 0,
        appointments,
        attendance: appointments ? completedAppts / appointments : 0,
        won,
        lost,
        conversionRate: leads ? won / leads : 0,
        bySource,
        byProduct,
        openByStage: byStage.map((s) => ({ stage: stages.find((x) => x.id === s.stageId) ?? { key: s.stageId, name: s.stageId, order: 99 }, count: s._count._all })).sort((a, b) => a.stage.order - b.stage.order),
      },
      conversational: {
        conversations: conv?.total ?? 0,
        aiOnly: conv?.ai_only ?? 0,
        withHuman: conv?.human ?? 0,
        handoffRate: conv?.total ? handoffs / conv.total : 0,
        avgMessagesPerConversation: conv?.avg_messages ?? 0,
        firstResponseSec: responseTimes[0]?.first_response_sec ?? null,
        avgResponseSec: responseTimes[0]?.avg_response_sec ?? null,
        followUps: Object.fromEntries(followups.map((f) => [f.status, f._count._all])),
        optOuts,
      },
      ai: {
        runs: ai?.runs ?? 0,
        costUsd: ai?.cost ?? 0,
        inputTokens: ai?.input_tokens ?? 0,
        outputTokens: ai?.output_tokens ?? 0,
        avgLatencyMs: ai?.avg_latency ?? 0,
        avgConfidence: ai?.avg_confidence ?? null,
        blockedByValidation: ai?.blocked ?? 0,
        byDecision: Object.fromEntries(agentRunsByDecision.map((d) => [d.decision ?? 'unknown', d._count._all])),
      },
    }
  }
}
