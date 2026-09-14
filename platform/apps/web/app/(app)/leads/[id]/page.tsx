'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { mutate } from 'swr'
import { api, useApi } from '@/lib/api'
import { FACT_LABELS, SOURCE_LABELS, brl, fmtDate } from '@/lib/utils'
import type { Fact, Stage } from '@/lib/types'
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ScorePill,
  StageBadge,
  Tabs,
  Textarea,
} from '@/components/ui/primitives'

interface Lead360 {
  id: string
  score: number
  scoreBreakdown: Array<{ key: string; points: number; explanation: string }>
  status: string
  probability: number
  estimatedValue: string | null
  nextBestAction: string | null
  nextFollowupAt: string | null
  nextFollowupReason: string | null
  mainPain: string | null
  goal: string | null
  urgency: string | null
  profileType: string | null
  aiSummary: string | null
  createdAt: string
  lastInteractionAt: string | null
  contact: {
    id: string
    name: string | null
    phone: string | null
    email: string | null
    city: string | null
    source: string | null
    company: { name: string } | null
    attribution: Array<{
      utmSource: string | null
      utmCampaign: string | null
      referralType: string | null
      headline: string | null
    }>
  }
  stage: Stage
  pipeline: { stages: Stage[] }
  owner: { id: string; name: string } | null
  interestProduct: { name: string } | null
  recommendedProduct: { name: string } | null
  facts: Fact[]
  tasks: Array<{ id: string; title: string; kind: string; priority: string; dueAt: string | null }>
  tags: Array<{ tag: { id: string; name: string } }>
  deals: Array<{ id: string; amount: string; status: string }>
  followUps: Array<{
    id: string
    scheduledAt: string
    reason: string
    scenario: string | null
    status: string
  }>
  appointments: Array<{ id: string; title: string; startsAt: string; status: string }>
  notes: Array<{ id: string; body: string; createdAt: string; author: { name: string } | null }>
  conversations: Array<{
    id: string
    mode: string
    status: string
    summary: string | null
    lastMessageAt: string | null
  }>
  lostReason: { name: string } | null
}

export default function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: lead } = useApi<Lead360>(`leads/${id}`)
  const { data: timeline } = useApi<{
    items: Array<{ id: string; at: string; kind: string; title: string; detail?: unknown }>
  }>(`leads/${id}/timeline`)
  const [tab, setTab] = useState('overview')
  const [note, setNote] = useState('')
  if (!lead) return <div className="p-6 text-sm text-muted">Carregando…</div>
  const refresh = () => mutate(`leads/${id}`)

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <header className="flex items-start justify-between rounded-2xl border bg-white p-5 shadow-soft">
        <div className="flex items-center gap-4">
          <Avatar name={lead.contact.name ?? lead.contact.phone} size="lg" />
          <div>
            <h1 className="text-lg font-semibold">
              {lead.contact.name ?? lead.contact.phone ?? 'Lead'}
            </h1>
            <p className="text-xs text-muted">
              {lead.contact.phone} {lead.contact.email && `· ${lead.contact.email}`}{' '}
              {lead.contact.city && `· ${lead.contact.city}`}{' '}
              {lead.contact.company && `· ${lead.contact.company.name}`}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StageBadge name={lead.stage.name} color={lead.stage.color} />
              <ScorePill score={lead.score} />
              {lead.profileType && <Badge tone="blue">{lead.profileType.toUpperCase()}</Badge>}
              {lead.urgency && (
                <Badge tone={lead.urgency === 'high' ? 'red' : 'amber'}>
                  urgência {lead.urgency}
                </Badge>
              )}
              {lead.owner ? (
                <Badge tone="slate">👤 {lead.owner.name}</Badge>
              ) : (
                <Badge tone="amber">sem responsável</Badge>
              )}
              {lead.tags.map((t) => (
                <Badge key={t.tag.id} tone="violet">
                  {t.tag.name}
                </Badge>
              ))}
              {lead.lostReason && <Badge tone="red">perdido: {lead.lostReason.name}</Badge>}
            </div>
          </div>
        </div>
        <div className="text-right text-xs text-muted">
          <p>Criado {fmtDate(lead.createdAt)}</p>
          <p>Última interação {fmtDate(lead.lastInteractionAt)}</p>
          <p>
            Probabilidade {lead.probability}%{' '}
            {lead.estimatedValue && `· ${brl(lead.estimatedValue)}`}
          </p>
          {lead.conversations[0] && (
            <Link
              href={`/inbox?c=${lead.conversations[0].id}`}
              className="mt-2 inline-block text-brand-700 hover:underline"
            >
              Abrir conversa →
            </Link>
          )}
        </div>
      </header>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'overview', label: 'Visão geral' },
          { key: 'timeline', label: 'Timeline', count: timeline?.items.length },
          { key: 'notes', label: 'Notas', count: lead.notes.length },
          { key: 'tasks', label: 'Tarefas', count: lead.tasks.length },
        ]}
      />

      {tab === 'overview' && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card title="Próxima melhor ação" className="md:col-span-2">
            <p className="text-base">{lead.nextBestAction ?? 'Acompanhar conversa'}</p>
            {lead.nextFollowupAt && (
              <p className="mt-1 text-xs text-muted">
                Follow-up automático em {fmtDate(lead.nextFollowupAt)} · {lead.nextFollowupReason}
              </p>
            )}
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted">Dor principal</dt>
              <dd>{lead.mainPain ?? '—'}</dd>
              <dt className="text-muted">Objetivo</dt>
              <dd>{lead.goal ?? '—'}</dd>
              <dt className="text-muted">Produto de interesse</dt>
              <dd>{lead.interestProduct?.name ?? '—'}</dd>
              <dt className="text-muted">Recomendado pela IA</dt>
              <dd>{lead.recommendedProduct?.name ?? '—'}</dd>
              <dt className="text-muted">Origem</dt>
              <dd>
                {lead.contact.source ?? '—'}{' '}
                {lead.contact.attribution[0]?.headline &&
                  `· ${lead.contact.attribution[0].headline}`}
              </dd>
            </dl>
            {lead.aiSummary && (
              <p className="mt-3 rounded-md bg-slate-50 p-2 text-xs text-slate-600">
                {lead.aiSummary}
              </p>
            )}
          </Card>
          <Card title={`Score ${lead.score}/100`}>
            <ul className="space-y-1 text-xs">
              {[...lead.scoreBreakdown]
                .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
                .map((f) => (
                  <li key={f.key} className="flex justify-between gap-2">
                    <span>{f.explanation}</span>
                    <span className={f.points >= 0 ? 'text-emerald-700' : 'text-red-600'}>
                      {f.points > 0 ? '+' : ''}
                      {f.points}
                    </span>
                  </li>
                ))}
              {!lead.scoreBreakdown.length && <li className="text-muted">Sem fatores ainda.</li>}
            </ul>
          </Card>
          <Card title="Fatos" className="md:col-span-2">
            {lead.facts.filter((f) => f.status === 'active').length ? (
              <table className="w-full text-sm">
                <tbody>
                  {lead.facts
                    .filter((f) => f.status === 'active')
                    .map((f) => (
                      <tr key={f.id} className="border-b last:border-0">
                        <td className="py-1.5 pr-3 text-muted">{FACT_LABELS[f.key] ?? f.key}</td>
                        <td className="py-1.5">{f.value}</td>
                        <td className="py-1.5 text-right">
                          <Badge
                            tone={
                              f.source === 'inferred'
                                ? 'amber'
                                : f.source === 'confirmed'
                                  ? 'green'
                                  : 'slate'
                            }
                          >
                            {SOURCE_LABELS[f.source] ?? f.source}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            ) : (
              <EmptyState
                title="Nenhum fato ainda"
                hint="A IA captura fatos naturalmente ao longo da conversa."
              />
            )}
          </Card>
          <div className="space-y-4">
            <Card title="Follow-ups">
              {lead.followUps.length ? (
                lead.followUps.map((f) => (
                  <div key={f.id} className="flex items-center justify-between text-xs">
                    <span>
                      {fmtDate(f.scheduledAt)} · {f.scenario ?? f.reason}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await api.post(`leads/${id}/followups/${f.id}/cancel`)
                        await refresh()
                      }}
                    >
                      cancelar
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted">Nenhum agendado.</p>
              )}
            </Card>
            <Card title="Agendamentos">
              {lead.appointments.length ? (
                lead.appointments.map((a) => (
                  <p key={a.id} className="text-xs">
                    {fmtDate(a.startsAt)} · {a.title}{' '}
                    <Badge
                      tone={
                        a.status === 'completed'
                          ? 'green'
                          : a.status === 'cancelled' || a.status === 'no_show'
                            ? 'red'
                            : 'blue'
                      }
                    >
                      {a.status}
                    </Badge>
                  </p>
                ))
              ) : (
                <p className="text-xs text-muted">Nenhum.</p>
              )}
            </Card>
          </div>
        </div>
      )}

      {tab === 'timeline' && (
        <Card>
          {timeline?.items.length ? (
            <ol className="relative space-y-3 border-l pl-4">
              {timeline.items.map((t) => (
                <li key={t.id} className="text-sm">
                  <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-brand-500" />
                  <p className="font-medium">{t.title}</p>
                  <p className="text-xs text-muted">
                    {fmtDate(t.at)} · {t.kind}
                  </p>
                  {t.detail !== undefined && t.detail !== null && (
                    <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-1.5 text-[10px] text-slate-600">
                      {JSON.stringify(t.detail).slice(0, 400)}
                    </pre>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState title="Sem eventos" />
          )}
        </Card>
      )}

      {tab === 'notes' && (
        <Card>
          <form
            className="mb-4 flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!note.trim()) return
              await api.post(`leads/${id}/notes`, { body: note.trim() })
              setNote('')
              await refresh()
            }}
          >
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Nova nota interna"
            />
            <Button type="submit">Salvar</Button>
          </form>
          {lead.notes.map((n) => (
            <div key={n.id} className="border-b py-2 text-sm last:border-0">
              <p className="whitespace-pre-wrap">{n.body}</p>
              <p className="text-xs text-muted">
                {n.author?.name ?? 'sistema'} · {fmtDate(n.createdAt)}
              </p>
            </div>
          ))}
        </Card>
      )}

      {tab === 'tasks' && (
        <Card>
          {lead.tasks.length ? (
            lead.tasks.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between border-b py-2 text-sm last:border-0"
              >
                <div>
                  <p>{t.title}</p>
                  <p className="text-xs text-muted">
                    {t.kind} · {t.priority} {t.dueAt && `· vence ${fmtDate(t.dueAt)}`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await api.post(`tasks/${t.id}/complete`)
                    await refresh()
                  }}
                >
                  Concluir
                </Button>
              </div>
            ))
          ) : (
            <EmptyState title="Sem tarefas abertas" />
          )}
        </Card>
      )}
    </div>
  )
}
