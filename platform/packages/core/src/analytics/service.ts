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
    const leadWhere = {
      tenantId,
      ...(range.unitId ? { unitId: range.unitId } : {}),
      createdAt: { gte: range.from, lte: range.to },
    }

    const [
      leads,
      qualified,
      won,
      lost,
      appointments,
      completedAppts,
      byStage,
      bySource,
      byProduct,
      convStats,
      aiStats,
      handoffs,
      followups,
      optOuts,
      responseTimes,
      agentRunsByDecision,
      funnelTimes,
      visitOutcomes,
      abandonment,
      followUpReplies,
      lostReasons,
    ] = await Promise.all([
      this.db.lead.count({ where: leadWhere }),
      this.db.lead.count({ where: { ...leadWhere, qualifiedAt: { not: null } } }),
      this.db.lead.count({
        where: {
          tenantId,
          ...(range.unitId ? { unitId: range.unitId } : {}),
          wonAt: { gte: range.from, lte: range.to },
        },
      }),
      this.db.lead.count({
        where: {
          tenantId,
          ...(range.unitId ? { unitId: range.unitId } : {}),
          lostAt: { gte: range.from, lte: range.to },
        },
      }),
      this.db.appointment.count({
        where: {
          tenantId,
          ...(range.unitId ? { unitId: range.unitId } : {}),
          createdAt: { gte: range.from, lte: range.to },
        },
      }),
      this.db.appointment.count({
        where: {
          tenantId,
          ...(range.unitId ? { unitId: range.unitId } : {}),
          status: 'completed',
          startsAt: { gte: range.from, lte: range.to },
        },
      }),
      this.db.lead.groupBy({
        by: ['stageId'],
        where: { tenantId, ...(range.unitId ? { unitId: range.unitId } : {}), status: 'open' },
        _count: { _all: true },
      }),
      this.db.$queryRaw<Array<{ source: string | null; count: number }>>(sql`
        SELECT c.source, COUNT(*)::int AS count FROM leads l JOIN contacts c ON c.id = l.contact_id
        WHERE l.tenant_id = ${tenantId}::uuid AND l.created_at BETWEEN ${range.from} AND ${range.to} ${range.unitId ? sql`AND l.unit_id = ${range.unitId}::uuid` : sql``}
        GROUP BY c.source ORDER BY count DESC LIMIT 10`),
      this.db.$queryRaw<Array<{ product: string | null; leads: number; won: number }>>(sql`
        SELECT p.name AS product, COUNT(*)::int AS leads, COUNT(*) FILTER (WHERE l.status = 'won')::int AS won
        FROM leads l LEFT JOIN products p ON p.id = COALESCE(l.interest_product_id, l.recommended_product_id)
        WHERE l.tenant_id = ${tenantId}::uuid AND l.created_at BETWEEN ${range.from} AND ${range.to} ${range.unitId ? sql`AND l.unit_id = ${range.unitId}::uuid` : sql``}
        GROUP BY p.name ORDER BY leads DESC LIMIT 10`),
      this.db.$queryRaw<
        Array<{ total: number; ai_only: number; human: number; avg_messages: number }>
      >(sql`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE handoff_at IS NULL)::int AS ai_only,
               COUNT(*) FILTER (WHERE handoff_at IS NOT NULL)::int AS human,
               COALESCE(AVG((SELECT COUNT(*) FROM messages m WHERE m.conversation_id = cv.id)), 0)::float AS avg_messages
        FROM conversations cv WHERE cv.tenant_id = ${tenantId}::uuid AND cv.created_at BETWEEN ${range.from} AND ${range.to} ${unitFilter}`),
      this.db.$queryRaw<
        Array<{
          runs: number
          cost: number
          input_tokens: number
          output_tokens: number
          avg_latency: number
          avg_confidence: number | null
          blocked: number
        }>
      >(sql`
        SELECT COUNT(*)::int AS runs, COALESCE(SUM(cost_usd),0)::float AS cost, COALESCE(SUM(input_tokens),0)::int AS input_tokens, COALESCE(SUM(output_tokens),0)::int AS output_tokens,
               COALESCE(AVG(latency_ms),0)::float AS avg_latency, AVG(confidence)::float AS avg_confidence,
               COUNT(*) FILTER (WHERE decision = 'blocked')::int AS blocked
        FROM agent_runs WHERE tenant_id = ${tenantId}::uuid AND kind = 'reply' AND created_at BETWEEN ${range.from} AND ${range.to} ${unitFilter}`),
      this.db.domainEvent.count({
        where: {
          tenantId,
          type: 'handoff.requested',
          occurredAt: { gte: range.from, lte: range.to },
          ...(range.unitId ? { unitId: range.unitId } : {}),
        },
      }),
      this.db.followUp.groupBy({
        by: ['status'],
        where: { tenantId, createdAt: { gte: range.from, lte: range.to } },
        _count: { _all: true },
      }),
      this.db.domainEvent.count({
        where: {
          tenantId,
          type: 'consent.revoked',
          occurredAt: { gte: range.from, lte: range.to },
        },
      }),
      this.db.$queryRaw<
        Array<{ first_response_sec: number | null; avg_response_sec: number | null }>
      >(sql`
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
      this.db.agentRun.groupBy({
        by: ['decision'],
        where: { tenantId, kind: 'reply', createdAt: { gte: range.from, lte: range.to } },
        _count: { _all: true },
      }),
      // Time to qualify / to book the visit (median hours) and share of leads with a visit booked
      this.db.$queryRaw<
        Array<{
          median_hours_to_qualify: number | null
          median_hours_to_visit: number | null
          leads: number
          leads_with_visit: number
        }>
      >(sql`
        WITH l AS (
          SELECT id, created_at, qualified_at FROM leads
          WHERE tenant_id = ${tenantId}::uuid AND created_at BETWEEN ${range.from} AND ${range.to} ${unitFilter}
        )
        SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (l.qualified_at - l.created_at)) / 3600) FILTER (WHERE l.qualified_at IS NOT NULL)::float AS median_hours_to_qualify,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (a.first_appt - l.created_at)) / 3600) FILTER (WHERE a.first_appt IS NOT NULL)::float AS median_hours_to_visit,
               COUNT(*)::int AS leads,
               COUNT(a.first_appt)::int AS leads_with_visit
        FROM l LEFT JOIN LATERAL (SELECT MIN(ap.created_at) AS first_appt FROM appointments ap WHERE ap.lead_id = l.id) a ON TRUE`),
      this.db.$queryRaw<Array<{ completed: number; no_show: number }>>(sql`
        SELECT COUNT(*) FILTER (WHERE status = 'completed')::int AS completed, COUNT(*) FILTER (WHERE status = 'no_show')::int AS no_show
        FROM appointments WHERE tenant_id = ${tenantId}::uuid AND starts_at BETWEEN ${range.from} AND ${range.to} ${unitFilter}`),
      // Abandoned: we answered, the customer went silent for 48h+ and nothing was closed
      this.db.$queryRaw<Array<{ total: number; abandoned: number }>>(sql`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE cv.status = 'open' AND cv.last_inbound_at < NOW() - INTERVAL '48 hours'
                                  AND cv.last_outbound_at > cv.last_inbound_at AND (l.id IS NULL OR l.status = 'open'))::int AS abandoned
        FROM conversations cv LEFT JOIN leads l ON l.id = cv.lead_id
        WHERE cv.tenant_id = ${tenantId}::uuid AND cv.created_at BETWEEN ${range.from} AND ${range.to} ${range.unitId ? sql`AND cv.unit_id = ${range.unitId}::uuid` : sql``}`),
      // Follow-ups that got an answer within 72h
      this.db.$queryRaw<Array<{ sent: number; replied: number }>>(sql`
        SELECT COUNT(*)::int AS sent,
               COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = f.conversation_id AND m.direction = 'inbound'
                                              AND m.created_at > f.sent_at AND m.created_at < f.sent_at + INTERVAL '72 hours'))::int AS replied
        FROM follow_ups f WHERE f.tenant_id = ${tenantId}::uuid AND f.status = 'sent' AND f.sent_at BETWEEN ${range.from} AND ${range.to}`),
      // Lost reasons: confirmed by a human vs kept from the AI suggestion
      this.db.$queryRaw<Array<{ reason: string | null; count: number; ai_suggested: number }>>(sql`
        SELECT lr.name AS reason, COUNT(*)::int AS count, COUNT(*) FILTER (WHERE l.lost_reason_suggested_by_ai)::int AS ai_suggested
        FROM leads l LEFT JOIN lost_reasons lr ON lr.id = l.lost_reason_id
        WHERE l.tenant_id = ${tenantId}::uuid AND l.lost_at BETWEEN ${range.from} AND ${range.to} ${range.unitId ? sql`AND l.unit_id = ${range.unitId}::uuid` : sql``}
        GROUP BY lr.name ORDER BY count DESC LIMIT 10`),
    ])

    const overdueSla = await this.db.$queryRaw<Array<{ count: number }>>(sql`
      SELECT COUNT(*)::int AS count FROM leads l JOIN pipeline_stages s ON s.id = l.stage_id
      WHERE l.tenant_id = ${tenantId}::uuid AND l.status = 'open' AND s.max_hours_in_stage IS NOT NULL
        AND l.stage_entered_at < NOW() - (s.max_hours_in_stage || ' hours')::interval ${range.unitId ? sql`AND l.unit_id = ${range.unitId}::uuid` : sql``}`)
    const stages = await this.db.pipelineStage.findMany({
      where: { id: { in: byStage.map((s) => s.stageId) } },
      select: { id: true, key: true, name: true, order: true },
    })
    const conv = convStats[0]
    const ai = aiStats[0]
    const insights = buildInsights({
      leads,
      won,
      lost,
      bySource,
      byProduct,
      lostReasons: lostReasons.map((r) => ({ reason: r.reason ?? 'sem motivo', count: r.count })),
      abandonmentRate: abandonment[0]?.total ? abandonment[0].abandoned / abandonment[0].total : 0,
      noShow: visitOutcomes[0] ?? { completed: 0, no_show: 0 },
      followUpReplies: followUpReplies[0] ?? { sent: 0, replied: 0 },
      visitBookingRate: funnelTimes[0]?.leads
        ? funnelTimes[0].leads_with_visit / funnelTimes[0].leads
        : 0,
      blocked: ai?.blocked ?? 0,
      runs: ai?.runs ?? 0,
      handoffRate: conv?.total ? handoffs / conv.total : 0,
      overdueSla: overdueSla[0]?.count ?? 0,
      firstResponseSec: responseTimes[0]?.first_response_sec ?? null,
    })
    return {
      range,
      insights,
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
        lostReasons: lostReasons.map((r) => ({
          reason: r.reason ?? 'sem motivo',
          count: r.count,
          aiSuggested: r.ai_suggested,
        })),
        openByStage: byStage
          .map((s) => ({
            stage: stages.find((x) => x.id === s.stageId) ?? {
              key: s.stageId,
              name: s.stageId,
              order: 99,
            },
            count: s._count._all,
          }))
          .sort((a, b) => a.stage.order - b.stage.order),
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
        followUpReplyRate: followUpReplies[0]?.sent
          ? followUpReplies[0].replied / followUpReplies[0].sent
          : null,
        optOuts,
        medianHoursToQualify: funnelTimes[0]?.median_hours_to_qualify ?? null,
        medianHoursToVisit: funnelTimes[0]?.median_hours_to_visit ?? null,
        visitBookingRate: funnelTimes[0]?.leads
          ? funnelTimes[0].leads_with_visit / funnelTimes[0].leads
          : 0,
        noShowRate:
          (visitOutcomes[0]?.completed ?? 0) + (visitOutcomes[0]?.no_show ?? 0)
            ? visitOutcomes[0]!.no_show / (visitOutcomes[0]!.completed + visitOutcomes[0]!.no_show)
            : null,
        abandonmentRate: abandonment[0]?.total
          ? abandonment[0].abandoned / abandonment[0].total
          : 0,
      },
      ai: {
        runs: ai?.runs ?? 0,
        costUsd: ai?.cost ?? 0,
        inputTokens: ai?.input_tokens ?? 0,
        outputTokens: ai?.output_tokens ?? 0,
        avgLatencyMs: ai?.avg_latency ?? 0,
        avgConfidence: ai?.avg_confidence ?? null,
        blockedByValidation: ai?.blocked ?? 0,
        byDecision: Object.fromEntries(
          agentRunsByDecision.map((d) => [d.decision ?? 'unknown', d._count._all]),
        ),
      },
    }
  }
}

export interface Insight {
  kind: string
  severity: 'good' | 'warn' | 'info'
  text: string
}

/** Rule-based insights over the period's numbers: only what stands out, in plain Portuguese. */
export function buildInsights(d: {
  leads: number
  won: number
  lost: number
  bySource: Array<{ source: string | null; count: number }>
  byProduct: Array<{ product: string | null; leads: number; won: number }>
  lostReasons: Array<{ reason: string; count: number }>
  abandonmentRate: number
  noShow: { completed: number; no_show: number }
  followUpReplies: { sent: number; replied: number }
  visitBookingRate: number
  blocked: number
  runs: number
  handoffRate: number
  overdueSla: number
  firstResponseSec: number | null
}): Insight[] {
  const out: Insight[] = []
  const pct = (v: number) => `${Math.round(v * 100)}%`
  if (d.leads >= 10) {
    const avg = d.won / d.leads
    const best = d.byProduct
      .filter((p) => p.leads >= 5)
      .map((p) => ({ ...p, rate: p.won / p.leads }))
      .sort((a, b) => b.rate - a.rate)[0]
    if (best && avg > 0 && best.rate >= avg * 1.5)
      out.push({
        kind: 'product_converts',
        severity: 'good',
        text: `"${best.product ?? 'sem produto'}" converte ${(best.rate / avg).toFixed(1)}x a média (${pct(best.rate)} vs ${pct(avg)}).`,
      })
    const top = d.bySource[0]
    if (top && top.count / d.leads >= 0.6)
      out.push({
        kind: 'source_concentration',
        severity: 'info',
        text: `${pct(top.count / d.leads)} dos leads vêm de "${top.source ?? 'origem desconhecida'}": dependência alta de um canal.`,
      })
  }
  if (d.leads >= 10 && d.visitBookingRate < 0.2)
    out.push({
      kind: 'low_booking',
      severity: 'warn',
      text: `Só ${pct(d.visitBookingRate)} dos leads chegaram a marcar visita. Revise o convite do agente (Prompts) e os horários disponíveis (Agenda).`,
    })
  if (d.leads >= 10 && d.visitBookingRate >= 0.4)
    out.push({
      kind: 'good_booking',
      severity: 'good',
      text: `${pct(d.visitBookingRate)} dos leads marcaram visita no período.`,
    })
  const visits = d.noShow.completed + d.noShow.no_show
  if (visits >= 5 && d.noShow.no_show / visits >= 0.3)
    out.push({
      kind: 'no_show',
      severity: 'warn',
      text: `No-show em ${pct(d.noShow.no_show / visits)} das visitas. Confira se os lembretes (24h/2h) estão saindo e se o template está aprovado.`,
    })
  if (d.abandonmentRate >= 0.4)
    out.push({
      kind: 'abandonment',
      severity: 'warn',
      text: `${pct(d.abandonmentRate)} das conversas ficaram sem resposta do cliente por 48h+. Vale reforçar os follow-ups ou uma campanha de reativação.`,
    })
  if (d.followUpReplies.sent >= 10) {
    const rate = d.followUpReplies.replied / d.followUpReplies.sent
    out.push({
      kind: 'followup_reply',
      severity: rate >= 0.25 ? 'good' : 'info',
      text: `Follow-ups respondidos: ${pct(rate)} de ${d.followUpReplies.sent} enviados.`,
    })
  }
  if (d.lost >= 5 && d.lostReasons[0] && d.lostReasons[0].count / d.lost >= 0.4)
    out.push({
      kind: 'lost_reason',
      severity: 'info',
      text: `"${d.lostReasons[0].reason}" responde por ${pct(d.lostReasons[0].count / d.lost)} das perdas. Um argumento pronto para essa objeção no Sales Brain pode ajudar.`,
    })
  if (d.runs >= 20 && d.blocked / d.runs >= 0.1)
    out.push({
      kind: 'blocked',
      severity: 'warn',
      text: `${pct(d.blocked / d.runs)} das respostas da IA foram bloqueadas pela validação. Use "Sugerir melhoria (IA)" em Prompts com esse período.`,
    })
  if (d.runs >= 20 && d.handoffRate >= 0.3)
    out.push({
      kind: 'handoff',
      severity: 'info',
      text: `${pct(d.handoffRate)} das conversas pediram humano. Veja os motivos em Execuções recentes.`,
    })
  if (d.overdueSla > 0)
    out.push({
      kind: 'sla',
      severity: d.overdueSla >= 5 ? 'warn' : 'info',
      text: `${d.overdueSla} lead(s) acima do SLA do estágio agora. Abra o Funil para distribuir.`,
    })
  if (d.firstResponseSec !== null && d.firstResponseSec > 300)
    out.push({
      kind: 'frt',
      severity: 'warn',
      text: `Primeira resposta leva em média ${Math.round(d.firstResponseSec / 60)} min. Verifique o worker (filas) e o modo humano nas conversas.`,
    })
  return out.slice(0, 6)
}
