'use client'

import { useState } from 'react'
import { useApi } from '@/lib/api'
import { useSession } from '@/lib/session'
import { DECISION_LABELS, INTENT_LABELS, cn, fmtDate } from '@/lib/utils'
import type { AgentRunRow } from '@/lib/types'
import { Badge, Card, Stat } from '@/components/ui/primitives'

interface Dashboard {
  insights: Array<{ kind: string; severity: 'good' | 'warn' | 'info'; text: string }>
  commercial: {
    leads: number
    qualified: number
    qualificationRate: number
    appointments: number
    attendance: number
    won: number
    lost: number
    conversionRate: number
    bySource: Array<{ source: string | null; count: number }>
    byProduct: Array<{ product: string | null; leads: number; won: number }>
    lostReasons: Array<{ reason: string; count: number; aiSuggested: number }>
    openByStage: Array<{ stage: { key: string; name: string }; count: number }>
  }
  conversational: {
    conversations: number
    aiOnly: number
    withHuman: number
    handoffRate: number
    avgMessagesPerConversation: number
    firstResponseSec: number | null
    avgResponseSec: number | null
    followUps: Record<string, number>
    followUpReplyRate: number | null
    optOuts: number
    medianHoursToQualify: number | null
    medianHoursToVisit: number | null
    visitBookingRate: number
    noShowRate: number | null
    abandonmentRate: number
  }
  ai: {
    runs: number
    costUsd: number
    inputTokens: number
    outputTokens: number
    avgLatencyMs: number
    avgConfidence: number | null
    blockedByValidation: number
    byDecision: Record<string, number>
  }
}

const pct = (v: number) => `${Math.round(v * 100)}%`
const hours = (v: number | null) =>
  v === null
    ? '—'
    : v < 1
      ? `${Math.round(v * 60)} min`
      : v < 48
        ? `${v.toFixed(1)} h`
        : `${(v / 24).toFixed(1)} d`
const secs = (v: number | null) =>
  v === null ? '—' : v < 60 ? `${Math.round(v)}s` : `${Math.round(v / 60)} min`

export default function AnalyticsPage() {
  const { unitId } = useSession()
  const [days, setDays] = useState(30)
  const from = new Date(Date.now() - days * 864e5).toISOString()
  const { data } = useApi<Dashboard>(
    unitId ? `analytics/dashboard?unitId=${unitId}&from=${from}` : null,
  )
  const { data: runs } = useApi<{ items: AgentRunRow[] }>('analytics/agent-runs?limit=30')
  const c = data?.commercial
  const v = data?.conversational
  const ai = data?.ai
  const maxStage = Math.max(1, ...(c?.openByStage.map((s) => s.count) ?? [1]))

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Analytics</h1>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs',
                days === d
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-100',
              )}
            >
              {d} dias
            </button>
          ))}
        </div>
      </div>
      {!data ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : (
        <>
          {data.insights.length > 0 && (
            <Card title="Insights do período">
              <ul className="space-y-1 text-sm">
                {data.insights.map((i) => (
                  <li key={i.kind} className="flex items-start gap-2">
                    <span
                      className={cn(
                        'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                        i.severity === 'good' && 'bg-green-500',
                        i.severity === 'warn' && 'bg-amber-500',
                        i.severity === 'info' && 'bg-slate-400',
                      )}
                    />
                    <span>{i.text}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
            <Stat label="Leads" value={c!.leads} />
            <Stat
              label="Qualificados"
              value={c!.qualified}
              hint={pct(c!.qualificationRate)}
              tone="brand"
            />
            <Stat
              label="Agendamentos"
              value={c!.appointments}
              hint={`comparecimento ${pct(c!.attendance)}`}
            />
            <Stat
              label="Vendas"
              value={c!.won}
              hint={`conversão ${pct(c!.conversionRate)}`}
              tone="green"
            />
            <Stat label="Perdidos" value={c!.lost} />
            <Stat
              label="1ª resposta"
              value={secs(v!.firstResponseSec)}
              hint={`média ${secs(v!.avgResponseSec)}`}
            />
            <Stat
              label="Custo IA"
              value={`$${ai!.costUsd.toFixed(2)}`}
              hint={`${ai!.runs} execuções`}
              tone="amber"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Card title="Funil (leads abertos por estágio)">
              <ul className="space-y-1.5">
                {c!.openByStage.map((s) => (
                  <li key={s.stage.key} className="text-xs">
                    <div className="flex justify-between">
                      <span>{s.stage.name}</span>
                      <span className="font-medium">{s.count}</span>
                    </div>
                    <div className="mt-0.5 h-1.5 rounded bg-slate-100">
                      <div
                        className="h-1.5 rounded bg-brand-500"
                        style={{ width: `${(s.count / maxStage) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Motivos de perda">
              <table className="w-full text-xs">
                <thead className="text-muted">
                  <tr>
                    <th className="text-left">Motivo</th>
                    <th>Leads</th>
                    <th title="Motivo sugerido pela IA e mantido pelo consultor">IA</th>
                  </tr>
                </thead>
                <tbody>
                  {c!.lostReasons.map((r, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1">{r.reason}</td>
                      <td className="text-center font-medium">{r.count}</td>
                      <td className="text-center text-muted">{r.aiSuggested}</td>
                    </tr>
                  ))}
                  {c!.lostReasons.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-2 text-center text-muted">
                        Nenhuma perda no período
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>
            <Card title="Origem dos leads">
              <table className="w-full text-xs">
                <tbody>
                  {c!.bySource.map((s, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1">{s.source ?? 'desconhecida'}</td>
                      <td className="text-right font-medium">{s.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card title="Conversão por produto">
              <table className="w-full text-xs">
                <thead className="text-muted">
                  <tr>
                    <th className="text-left">Produto</th>
                    <th>Leads</th>
                    <th>Vendas</th>
                    <th>%</th>
                  </tr>
                </thead>
                <tbody>
                  {c!.byProduct.map((p, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1">{p.product ?? 'sem produto'}</td>
                      <td className="text-center">{p.leads}</td>
                      <td className="text-center">{p.won}</td>
                      <td className="text-center">{p.leads ? pct(p.won / p.leads) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Conversas">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <dt className="text-muted">Conversas</dt>
                <dd>{v!.conversations}</dd>
                <dt className="text-muted">Só IA</dt>
                <dd>{v!.aiOnly}</dd>
                <dt className="text-muted">Com humano</dt>
                <dd>{v!.withHuman}</dd>
                <dt className="text-muted">Taxa de handoff</dt>
                <dd>{pct(v!.handoffRate)}</dd>
                <dt className="text-muted">Msgs por conversa</dt>
                <dd>{v!.avgMessagesPerConversation.toFixed(1)}</dd>
                <dt className="text-muted">Tempo até qualificar (mediana)</dt>
                <dd>{hours(v!.medianHoursToQualify)}</dd>
                <dt className="text-muted">Tempo até marcar visita (mediana)</dt>
                <dd>{hours(v!.medianHoursToVisit)}</dd>
                <dt className="text-muted">Leads com visita marcada</dt>
                <dd>{pct(v!.visitBookingRate)}</dd>
                <dt className="text-muted">No-show</dt>
                <dd>{v!.noShowRate === null ? '—' : pct(v!.noShowRate)}</dd>
                <dt className="text-muted">Abandono (48h sem resposta)</dt>
                <dd className={v!.abandonmentRate > 0.4 ? 'text-red-600' : ''}>
                  {pct(v!.abandonmentRate)}
                </dd>
                <dt className="text-muted">Follow-ups respondidos</dt>
                <dd>{v!.followUpReplyRate === null ? '—' : pct(v!.followUpReplyRate)}</dd>
                <dt className="text-muted">Opt-outs</dt>
                <dd>{v!.optOuts}</dd>
                <dt className="text-muted">Follow-ups</dt>
                <dd>
                  {Object.entries(v!.followUps)
                    .map(([k, n]) => `${k}: ${n}`)
                    .join(' · ') || '—'}
                </dd>
              </dl>
            </Card>
            <Card title="IA">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <dt className="text-muted">Execuções</dt>
                <dd>{ai!.runs}</dd>
                <dt className="text-muted">Tokens (in/out)</dt>
                <dd>
                  {ai!.inputTokens.toLocaleString('pt-BR')} /{' '}
                  {ai!.outputTokens.toLocaleString('pt-BR')}
                </dd>
                <dt className="text-muted">Latência média</dt>
                <dd>{Math.round(ai!.avgLatencyMs)} ms</dd>
                <dt className="text-muted">Confiança média</dt>
                <dd>{ai!.avgConfidence !== null ? pct(ai!.avgConfidence) : '—'}</dd>
                <dt className="text-muted">Bloqueadas pela validação</dt>
                <dd className={ai!.blockedByValidation ? 'text-red-600' : ''}>
                  {ai!.blockedByValidation}
                </dd>
                <dt className="text-muted">Decisões</dt>
                <dd>
                  {Object.entries(ai!.byDecision)
                    .map(([k, n]) => `${DECISION_LABELS[k] ?? k}: ${n}`)
                    .join(' · ') || '—'}
                </dd>
              </dl>
            </Card>
          </div>
        </>
      )}
      <Card title="Execuções recentes do agente">
        <table className="w-full text-xs">
          <thead className="text-left text-muted">
            <tr>
              <th>Quando</th>
              <th>Tipo</th>
              <th>Intenção</th>
              <th>Decisão</th>
              <th>Conf.</th>
              <th>Modelo</th>
              <th>Tokens</th>
              <th>Custo</th>
              <th>Latência</th>
            </tr>
          </thead>
          <tbody>
            {(runs?.items ?? []).map((r) => (
              <tr key={r.id} className="border-t">
                <td className="py-1">{fmtDate(r.createdAt)}</td>
                <td>{r.kind}</td>
                <td>
                  {r.classification
                    ? (INTENT_LABELS[r.classification.intent] ?? r.classification.intent)
                    : '—'}
                </td>
                <td>
                  <Badge
                    tone={
                      r.decision === 'reply'
                        ? 'green'
                        : r.decision === 'handoff'
                          ? 'amber'
                          : r.decision === 'blocked'
                            ? 'red'
                            : 'slate'
                    }
                  >
                    {DECISION_LABELS[r.decision ?? ''] ?? r.decision ?? r.status}
                  </Badge>
                </td>
                <td>{r.confidence !== null ? pct(r.confidence) : '—'}</td>
                <td>{r.model ?? '—'}</td>
                <td>
                  {r.inputTokens}/{r.outputTokens}
                </td>
                <td>${Number(r.costUsd).toFixed(4)}</td>
                <td>{r.latencyMs} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
