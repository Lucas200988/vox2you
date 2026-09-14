'use client'

import { useState } from 'react'
import Link from 'next/link'
import { mutate } from 'swr'
import { ExternalLink, Plus, X } from 'lucide-react'
import { api, useApi } from '@/lib/api'
import { FACT_LABELS, SOURCE_LABELS, fmtDate } from '@/lib/utils'
import type { ConversationDetail, Stage } from '@/lib/types'
import { Badge, Button, Input, Select, useToast } from '@/components/ui/primitives'

export function LeadPanel({ conversationId }: { conversationId: string }) {
  const { data: conv } = useApi<ConversationDetail>(`conversations/${conversationId}`)
  const { data: pipelines } = useApi<{ items: Array<{ id: string; stages: Stage[] }> }>('pipelines')
  const { data: users } = useApi<{ items: Array<{ id: string; name: string }> }>('users', {
    shouldRetryOnError: false,
  })
  const toast = useToast()
  const [factKey, setFactKey] = useState('goal')
  const [factValue, setFactValue] = useState('')
  const [tag, setTag] = useState('')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', city: '' })
  if (!conv) return null
  const lead = conv.lead
  const stages = pipelines?.items[0]?.stages ?? []
  const refresh = () =>
    Promise.all([
      mutate(`conversations/${conversationId}`),
      mutate((k) => typeof k === 'string' && k.startsWith('conversations/?')),
    ])

  return (
    <div className="space-y-4 p-4 text-sm">
      <section>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-base font-semibold">{conv.contact.name ?? 'Sem nome'}</p>
            <p className="text-xs text-muted">{conv.contact.phone}</p>
          </div>
          {lead && (
            <Link
              href={`/leads/${lead.id}`}
              className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline"
            >
              Lead 360 <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
        {editing ? (
          <div className="mt-2 space-y-1.5">
            <Input
              placeholder="Nome"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              placeholder="E-mail"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <Input
              placeholder="Cidade"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
            <div className="flex gap-1">
              <Button
                size="sm"
                onClick={async () => {
                  await api.patch(`contacts/${conv.contact.id}`, {
                    name: form.name || undefined,
                    email: form.email || undefined,
                    city: form.city || undefined,
                  })
                  await refresh()
                  setEditing(false)
                }}
              >
                Salvar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted">E-mail</dt>
            <dd>{conv.contact.email ?? '—'}</dd>
            <dt className="text-muted">Cidade</dt>
            <dd>{conv.contact.city ?? '—'}</dd>
            <dt className="text-muted">Perfil</dt>
            <dd>
              {conv.contact.profileType?.toUpperCase() ?? '—'}
              {conv.contact.company ? ` · ${conv.contact.company.name}` : ''}
            </dd>
            <dt className="text-muted">Origem</dt>
            <dd>{conv.contact.source ?? '—'}</dd>
            <dt className="text-muted">Marketing</dt>
            <dd>
              {conv.contact.consents.find((c) => c.purpose === 'marketing')?.status ===
              'opted_out' ? (
                <Badge tone="red">opt-out</Badge>
              ) : (
                <Badge tone="slate">sem opt-out</Badge>
              )}
            </dd>
          </dl>
        )}
        {!editing && (
          <button
            type="button"
            className="mt-1 text-xs text-brand-700 hover:underline"
            onClick={() => {
              setForm({
                name: conv.contact.name ?? '',
                email: conv.contact.email ?? '',
                city: conv.contact.city ?? '',
              })
              setEditing(true)
            }}
          >
            editar contato
          </button>
        )}
      </section>

      {lead && (
        <>
          <section className="rounded-xl border bg-slate-50 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Score</p>
              <span className="text-lg font-semibold">
                {lead.score}
                <span className="text-xs text-muted">/100</span>
              </span>
            </div>
            <ul className="mt-1 space-y-0.5 text-xs">
              {[...(lead.scoreBreakdown ?? [])]
                .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
                .slice(0, 5)
                .map((f) => (
                  <li key={f.key} className="flex justify-between">
                    <span className="text-slate-600">{f.explanation}</span>
                    <span className={f.points >= 0 ? 'text-emerald-700' : 'text-red-600'}>
                      {f.points > 0 ? '+' : ''}
                      {f.points}
                    </span>
                  </li>
                ))}
            </ul>
          </section>

          <section className="space-y-2">
            <Label>Estágio</Label>
            <Select
              value={lead.stage.id}
              onChange={async (e) => {
                await api.post(`leads/${lead.id}/stage`, {
                  stageId: e.target.value,
                  reason: 'manual',
                })
                await refresh()
                toast.show('Estágio atualizado')
              }}
            >
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Label>Responsável</Label>
            <Select
              value={lead.owner?.id ?? ''}
              onChange={async (e) => {
                await api.post(`leads/${lead.id}/assign`, { ownerId: e.target.value || null })
                await refresh()
              }}
            >
              <option value="">— sem responsável —</option>
              {(users?.items ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
            <Button
              size="sm"
              variant="ghost"
              className="mt-1"
              title="Entrega ao consultor da unidade com menos leads abertos (rodízio)"
              onClick={async () => {
                const r = await api.post<{ assigned: boolean; ownerId: string | null }>(
                  `leads/${lead.id}/auto-assign`,
                  {},
                )
                await refresh()
                toast.show(
                  r.assigned
                    ? 'Lead distribuído pelo rodízio'
                    : 'Nenhum consultor elegível na unidade',
                )
              }}
            >
              Distribuir automaticamente
            </Button>
          </section>

          <section className="rounded-xl border border-brand-100 bg-brand-50/60 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-brand-700">
              Próxima melhor ação
            </p>
            <p className="mt-1">{lead.nextBestAction ?? 'Acompanhar conversa'}</p>
            {lead.nextFollowupAt && (
              <p className="mt-1 text-xs text-muted">
                Follow-up automático: {fmtDate(lead.nextFollowupAt, undefined, conv.unit.timezone)}{' '}
                · {lead.nextFollowupReason}
              </p>
            )}
            <p className="mt-1 text-xs text-muted">
              Produto: {lead.interestProduct?.name ?? lead.recommendedProduct?.name ?? '—'}
              {lead.recommendedProduct && !lead.interestProduct ? ' (recomendado pela IA)' : ''}
            </p>
          </section>

          <section>
            <Label>Fatos do lead</Label>
            <ul className="space-y-1">
              {lead.facts
                .filter((f) => f.status !== 'rejected' && f.status !== 'stale')
                .map((f) => (
                  <li
                    key={f.id}
                    className="flex items-start justify-between gap-2 rounded-md border px-2 py-1 text-xs"
                  >
                    <div>
                      <span className="text-muted">{FACT_LABELS[f.key] ?? f.key}:</span> {f.value}{' '}
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
                    </div>
                    <button
                      type="button"
                      title="Rejeitar fato"
                      className="text-slate-400 hover:text-red-600"
                      onClick={async () => {
                        await api.del(`leads/${lead.id}/facts/${f.id}`)
                        await refresh()
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
            </ul>
            <div className="mt-2 flex gap-1">
              <Select className="w-32" value={factKey} onChange={(e) => setFactKey(e.target.value)}>
                {Object.entries(FACT_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
              <Input
                placeholder="valor"
                value={factValue}
                onChange={(e) => setFactValue(e.target.value)}
              />
              <Button
                size="icon"
                variant="secondary"
                onClick={async () => {
                  if (!factValue.trim()) return
                  await api.post(`leads/${lead.id}/facts`, {
                    key: factKey,
                    value: factValue.trim(),
                    source: 'confirmed',
                  })
                  setFactValue('')
                  await refresh()
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </section>

          <section>
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-1">
              {lead.tags.map((t) => (
                <Badge key={t.tag.id} tone="violet">
                  {t.tag.name}{' '}
                  <button
                    type="button"
                    onClick={async () => {
                      await api.del(`leads/${lead.id}/tags/${t.tag.id}`)
                      await refresh()
                    }}
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
            <form
              className="mt-1 flex gap-1"
              onSubmit={async (e) => {
                e.preventDefault()
                if (!tag.trim()) return
                await api.post(`leads/${lead.id}/tags`, { name: tag.trim() })
                setTag('')
                await refresh()
              }}
            >
              <Input placeholder="nova tag" value={tag} onChange={(e) => setTag(e.target.value)} />
              <Button size="icon" variant="secondary" type="submit">
                <Plus className="h-4 w-4" />
              </Button>
            </form>
          </section>
        </>
      )}

      {conv.handoffSummary && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs">
          <p className="font-medium text-amber-900">Resumo do handoff</p>
          <pre className="mt-1 whitespace-pre-wrap text-amber-900/80">
            {JSON.stringify(conv.handoffSummary, null, 1).replace(/[{}"]/g, '')}
          </pre>
        </section>
      )}
      {conv.summary && (
        <section>
          <Label>Resumo da conversa (IA)</Label>
          <p className="text-xs text-slate-600">{conv.summary}</p>
        </section>
      )}
      {toast.node}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">{children}</p>
  )
}
