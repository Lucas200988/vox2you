'use client'

import { useState } from 'react'
import { mutate } from 'swr'
import { api, useApi } from '@/lib/api'
import { useSession } from '@/lib/session'
import { cn, fmtDate } from '@/lib/utils'
import type { Stage } from '@/lib/types'
import {
  Badge,
  Button,
  Card,
  Dialog,
  Field,
  Input,
  Select,
  useToast,
} from '@/components/ui/primitives'

interface Template {
  id: string
  name: string
  status: string
  category: string
  variables: string[]
  body: string | null
}
interface Segment {
  stageKeys?: string[]
  statuses?: string[]
  minScore?: number
  inactiveForDays?: number
  sources?: string[]
  sendWindow?: { start: string; end: string }
}
interface Campaign {
  id: string
  name: string
  unitId: string
  status: string
  templateId: string | null
  template: { id: string; name: string; status: string; variables: string[] } | null
  segment: Segment
  variables: string[]
  rateLimitPerMin: number
  scheduledAt: string | null
  stats: Record<string, unknown>
  createdAt: string
}
interface Stats {
  total: number
  byStatus: Record<string, number>
  sent: number
  replied: number
  replyRate: number
  failed: number
  pending: number
}

const STATUS: Record<
  string,
  { label: string; tone: 'slate' | 'blue' | 'green' | 'amber' | 'red' }
> = {
  draft: { label: 'Rascunho', tone: 'slate' },
  scheduled: { label: 'Agendada', tone: 'blue' },
  running: { label: 'Enviando', tone: 'green' },
  paused: { label: 'Pausada', tone: 'amber' },
  completed: { label: 'Concluída', tone: 'slate' },
  cancelled: { label: 'Cancelada', tone: 'red' },
}
const SOURCES = [
  'whatsapp_organic',
  'click_to_whatsapp',
  'instagram',
  'referral',
  'qr',
  'landing',
  'import',
]

const emptyForm = () => ({
  name: '',
  templateId: '',
  stageKeys: [] as string[],
  minScore: '',
  inactiveForDays: '',
  sources: [] as string[],
  windowStart: '08:00',
  windowEnd: '20:00',
  rateLimitPerMin: '30',
  variables: [] as string[],
})

/** Campanhas: segmento de leads → template aprovado → envio com limite/min dentro da janela local. */
export default function CampaignsPage() {
  const { unitId } = useSession()
  const toast = useToast()
  const key = unitId ? `campaigns?unitId=${unitId}` : null
  const { data } = useApi<{ items: Campaign[]; tokens: string[] }>(key, { refreshInterval: 30000 })
  const { data: templates } = useApi<{ items: Template[] }>('templates')
  const { data: pipelines } = useApi<{ items: Array<{ stages: Stage[] }> }>('pipelines')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [preview, setPreview] = useState<{ total: number } | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const { data: detail } = useApi<Campaign & { stats: Stats }>(
    selected ? `campaigns/${selected}` : null,
    {
      refreshInterval: 15000,
    },
  )

  const stages = pipelines?.items?.[0]?.stages ?? []
  const approved = (templates?.items ?? []).filter((t) => t.status === 'approved')
  const template = approved.find((t) => t.id === form.templateId) ?? null

  const segment = (): Segment => ({
    stageKeys: form.stageKeys.length ? form.stageKeys : undefined,
    minScore: form.minScore ? Number(form.minScore) : undefined,
    inactiveForDays: form.inactiveForDays ? Number(form.inactiveForDays) : undefined,
    sources: form.sources.length ? form.sources : undefined,
    sendWindow:
      form.windowStart && form.windowEnd
        ? { start: form.windowStart, end: form.windowEnd }
        : undefined,
  })

  const refresh = () =>
    mutate((k) => typeof k === 'string' && k.startsWith('campaigns'), undefined, {
      revalidate: true,
    })

  const doPreview = async () => {
    if (!unitId) return
    const r = await api.post<{ total: number }>('campaigns/preview', { unitId, segment: segment() })
    setPreview(r)
  }
  const save = async () => {
    if (!unitId) return
    try {
      await api.post('campaigns', {
        name: form.name,
        unitId,
        templateId: form.templateId || null,
        segment: segment(),
        variables: form.variables,
        rateLimitPerMin: Number(form.rateLimitPerMin) || 30,
      })
      await refresh()
      setOpen(false)
      setForm(emptyForm())
      setPreview(null)
      toast.show('Campanha criada como rascunho')
    } catch (e) {
      toast.show((e as Error).message)
    }
  }
  const action = async (id: string, what: 'schedule' | 'pause' | 'resume' | 'cancel') => {
    try {
      await api.post(`campaigns/${id}/${what}`)
      await refresh()
      toast.show(
        {
          schedule: 'Campanha agendada: os envios começam no próximo minuto dentro da janela',
          pause: 'Campanha pausada',
          resume: 'Campanha retomada',
          cancel: 'Campanha cancelada',
        }[what],
      )
    } catch (e) {
      toast.show((e as Error).message)
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Campanhas</h1>
          <p className="text-xs text-muted">
            Envio em lote por template aprovado do WhatsApp, com limite por minuto e janela de
            horário da unidade. Quem responder volta para o agente normalmente.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} disabled={!unitId}>
          Nova campanha
        </Button>
      </div>

      {approved.length === 0 && (
        <Card className="border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Nenhum template aprovado ainda. Sincronize em Configurações → Integrações → WhatsApp
          (botão de templates) depois de aprovar um template MARKETING na Meta.
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Campanha</th>
                <th className="py-2 font-medium">Template</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">Destinatários</th>
                <th className="py-2 font-medium">Enviadas / Respostas</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((c) => {
                const st = STATUS[c.status] ?? { label: c.status, tone: 'slate' as const }
                const stats = c.stats as Partial<Stats> & { recipients?: number }
                return (
                  <tr
                    key={c.id}
                    className={cn(
                      'cursor-pointer border-t hover:bg-slate-50',
                      selected === c.id && 'bg-brand-50/50',
                    )}
                    onClick={() => setSelected(c.id)}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-[11px] text-muted">
                        {c.scheduledAt ? fmtDate(c.scheduledAt) : 'sem data'} · {c.rateLimitPerMin}
                        /min
                      </div>
                    </td>
                    <td className="py-2 text-xs">{c.template?.name ?? '—'}</td>
                    <td className="py-2">
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </td>
                    <td className="py-2 text-xs">{stats.total ?? stats.recipients ?? '—'}</td>
                    <td className="py-2 text-xs">
                      {stats.sent ?? 0} / {stats.replied ?? 0}
                    </td>
                    <td className="py-2 pr-2 text-right" onClick={(e) => e.stopPropagation()}>
                      {['draft', 'paused'].includes(c.status) && c.status === 'draft' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void action(c.id, 'schedule')}
                          disabled={!c.templateId}
                        >
                          Agendar
                        </Button>
                      )}
                      {['scheduled', 'running'].includes(c.status) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void action(c.id, 'pause')}
                        >
                          Pausar
                        </Button>
                      )}
                      {c.status === 'paused' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void action(c.id, 'resume')}
                        >
                          Retomar
                        </Button>
                      )}
                      {!['completed', 'cancelled'].includes(c.status) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void action(c.id, 'cancel')}
                        >
                          Cancelar
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {data && data.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted">
                    Nenhuma campanha ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        <Card className="p-4">
          {!detail ? (
            <p className="text-sm text-muted">Selecione uma campanha para ver os números.</p>
          ) : (
            <div className="space-y-3 text-sm">
              <div>
                <h2 className="font-semibold">{detail.name}</h2>
                <p className="text-xs text-muted">
                  Template: {detail.template?.name ?? '—'} · Janela{' '}
                  {detail.segment.sendWindow
                    ? `${detail.segment.sendWindow.start}–${detail.segment.sendWindow.end}`
                    : 'livre'}
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted">Destinatários</dt>
                <dd>{detail.stats.total}</dd>
                <dt className="text-muted">Enviadas</dt>
                <dd>{detail.stats.sent}</dd>
                <dt className="text-muted">Respostas</dt>
                <dd>
                  {detail.stats.replied} ({Math.round(detail.stats.replyRate * 100)}%)
                </dd>
                <dt className="text-muted">Pendentes</dt>
                <dd>{detail.stats.pending}</dd>
                <dt className="text-muted">Falhas</dt>
                <dd className={detail.stats.failed ? 'text-red-600' : ''}>{detail.stats.failed}</dd>
                {Object.entries(detail.stats.byStatus).map(([k, n]) => (
                  <>
                    <dt key={`k-${k}`} className="text-muted">
                      · {k}
                    </dt>
                    <dd key={`v-${k}`}>{n}</dd>
                  </>
                ))}
              </dl>
              {typeof detail.stats['error' as keyof Stats] === 'string' && (
                <p className="rounded bg-red-50 p-2 text-xs text-red-700">
                  Pausada automaticamente:{' '}
                  {String((detail.stats as Record<string, unknown>)['error'])}
                </p>
              )}
              {detail.variables.length > 0 && (
                <p className="text-xs text-muted">Variáveis: {detail.variables.join(' · ')}</p>
              )}
            </div>
          )}
        </Card>
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} title="Nova campanha">
        <div className="space-y-3">
          <Field label="Nome">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Template aprovado (WhatsApp)">
            <Select
              value={form.templateId}
              onChange={(e) => {
                const t = approved.find((x) => x.id === e.target.value)
                setForm({
                  ...form,
                  templateId: e.target.value,
                  variables: t ? t.variables.map(() => '{{firstName}}') : [],
                })
              }}
            >
              <option value="">Escolha…</option>
              {approved.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.category})
                </option>
              ))}
            </Select>
            {template?.body && (
              <p className="mt-1 whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs">
                {template.body}
              </p>
            )}
          </Field>
          {template && template.variables.length > 0 && (
            <Field label={`Variáveis do template (tokens: ${(data?.tokens ?? []).join(' ')})`}>
              <div className="space-y-1">
                {template.variables.map((v, i) => (
                  <Input
                    key={v}
                    placeholder={`{{${i + 1}}}`}
                    value={form.variables[i] ?? ''}
                    onChange={(e) => {
                      const next = [...form.variables]
                      next[i] = e.target.value
                      setForm({ ...form, variables: next })
                    }}
                  />
                ))}
              </div>
            </Field>
          )}
          <Field label="Estágios (vazio = todos os leads abertos)">
            <div className="flex flex-wrap gap-1">
              {stages
                .filter((s) => !['won', 'lost'].includes(s.kind))
                .map((s) => {
                  const on = form.stageKeys.includes(s.key)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-xs',
                        on ? 'border-brand-600 bg-brand-50 text-brand-800' : 'text-slate-600',
                      )}
                      onClick={() =>
                        setForm({
                          ...form,
                          stageKeys: on
                            ? form.stageKeys.filter((k) => k !== s.key)
                            : [...form.stageKeys, s.key],
                        })
                      }
                    >
                      {s.name}
                    </button>
                  )
                })}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Score mínimo">
              <Input
                inputMode="numeric"
                value={form.minScore}
                onChange={(e) => setForm({ ...form, minScore: e.target.value })}
                placeholder="0"
              />
            </Field>
            <Field label="Sem interação há (dias)">
              <Input
                inputMode="numeric"
                value={form.inactiveForDays}
                onChange={(e) => setForm({ ...form, inactiveForDays: e.target.value })}
                placeholder="ex.: 7"
              />
            </Field>
            <Field label="Janela de envio (início)">
              <Input
                type="time"
                value={form.windowStart}
                onChange={(e) => setForm({ ...form, windowStart: e.target.value })}
              />
            </Field>
            <Field label="Janela de envio (fim)">
              <Input
                type="time"
                value={form.windowEnd}
                onChange={(e) => setForm({ ...form, windowEnd: e.target.value })}
              />
            </Field>
            <Field label="Limite por minuto">
              <Input
                inputMode="numeric"
                value={form.rateLimitPerMin}
                onChange={(e) => setForm({ ...form, rateLimitPerMin: e.target.value })}
              />
            </Field>
            <Field label="Origem (vazio = todas)">
              <Select
                value=""
                onChange={(e) => {
                  const v = e.target.value
                  if (v && !form.sources.includes(v))
                    setForm({ ...form, sources: [...form.sources, v] })
                }}
              >
                <option value="">
                  {form.sources.length ? form.sources.join(', ') : 'Adicionar origem…'}
                </option>
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-muted">
              <Button size="sm" variant="ghost" onClick={() => void doPreview()}>
                Contar destinatários
              </Button>
              {preview && (
                <span className="ml-2 font-medium text-slate-700">{preview.total} lead(s)</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={() => void save()} disabled={!form.name || !form.templateId}>
                Salvar rascunho
              </Button>
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
