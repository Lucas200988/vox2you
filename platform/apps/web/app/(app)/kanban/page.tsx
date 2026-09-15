'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { mutate } from 'swr'
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { api, useApi } from '@/lib/api'
import { useSession } from '@/lib/session'
import { cn, relTime } from '@/lib/utils'
import type { Stage } from '@/lib/types'
import { Avatar, Button, Dialog, Input, ScorePill, Select } from '@/components/ui/primitives'

interface KanbanLead {
  id: string
  score: number
  stageId: string
  stageEnteredAt: string
  contact: { name: string | null; phone: string | null; profileType: string | null }
  owner: { id: string; name: string } | null
  interestProduct: { name: string } | null
  recommendedProduct: { name: string } | null
  nextBestAction: string | null
}
interface LostSuggestion {
  reasonId: string
  key: string
  name: string
  confidence: number
  why: string
}
interface Kanban {
  columns: Array<{ stage: Stage; leads: KanbanLead[] }>
}

export default function KanbanPage() {
  const { unitId } = useSession()
  const key = unitId ? `leads/kanban?unitId=${unitId}` : null
  const { data } = useApi<Kanban>(key, { refreshInterval: 20000 })
  const { data: reasons } = useApi<{
    items: Array<{ id: string; name: string; parentId: string | null }>
  }>('lost-reasons')
  const { data: users } = useApi<{ items: Array<{ id: string; name: string }> }>('users', {
    shouldRetryOnError: false,
  })
  const [q, setQ] = useState('')
  const [owner, setOwner] = useState('')
  const [minScore, setMinScore] = useState(0)
  const [lost, setLost] = useState<{ leadId: string; stageId: string } | null>(null)
  const [lostReason, setLostReason] = useState('')
  const [suggestion, setSuggestion] = useState<LostSuggestion | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const columns = useMemo(
    () =>
      (data?.columns ?? []).map((c) => ({
        ...c,
        leads: c.leads.filter(
          (l) =>
            (!q ||
              (l.contact.name ?? l.contact.phone ?? '').toLowerCase().includes(q.toLowerCase())) &&
            (!owner || l.owner?.id === owner) &&
            l.score >= minScore,
        ),
      })),
    [data, q, owner, minScore],
  )

  async function move(leadId: string, stageId: string, extra: Record<string, unknown> = {}) {
    await api.post(`leads/${leadId}/stage`, { stageId, reason: 'kanban', ...extra })
    await mutate(key)
  }

  function onDragEnd(e: DragEndEvent) {
    const leadId = String(e.active.id)
    const stageId = e.over ? String(e.over.id) : null
    if (!stageId || !data) return
    const target = data.columns.find((c) => c.stage.id === stageId)
    const current = data.columns.find((c) => c.leads.some((l) => l.id === leadId))
    if (!target || current?.stage.id === stageId) return
    if (target.stage.kind === 'lost') {
      setLost({ leadId, stageId })
      setSuggestion(null)
      void api
        .get<{ suggestion: LostSuggestion | null }>(`leads/${leadId}/lost-suggestion`)
        .then((r) => {
          setSuggestion(r.suggestion)
          if (r.suggestion) setLostReason((cur) => cur || r.suggestion!.reasonId)
        })
        .catch(() => undefined)
      return
    }
    void move(leadId, stageId)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b bg-white px-4 py-2">
        <Input
          className="w-56"
          placeholder="Buscar lead"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select className="w-44" value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">Todos os responsáveis</option>
          {(users?.items ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-xs text-muted">
          Score ≥ {minScore}
          <input
            type="range"
            min={0}
            max={100}
            step={10}
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
          />
        </label>
        <span className="ml-auto text-xs text-muted">
          {columns.reduce((s, c) => s + c.leads.length, 0)} leads
        </span>
      </div>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex flex-1 gap-3 overflow-x-auto p-4">
          {columns.map((col) => (
            <Column
              key={col.stage.id}
              stage={col.stage}
              count={col.leads.length}
              overdue={col.leads.filter((l) => isOverdue(l, col.stage)).length}
            >
              {col.leads.map((l) => (
                <CardItem key={l.id} lead={l} overdue={isOverdue(l, col.stage)} />
              ))}
            </Column>
          ))}
          {!data && <p className="text-sm text-muted">Carregando…</p>}
        </div>
      </DndContext>
      <Dialog open={!!lost} onClose={() => setLost(null)} title="Motivo da perda">
        <p className="mb-2 text-xs text-muted">
          Registre o motivo estruturado. Esta é a confirmação humana; a sugestão da IA fica
          registrada à parte.
        </p>
        {suggestion && (
          <p className="mb-2 rounded-lg bg-brand-50 px-2 py-1.5 text-xs text-brand-800">
            Sugestão da IA: <span className="font-medium">{suggestion.name}</span> —{' '}
            {suggestion.why} ({Math.round(suggestion.confidence * 100)}%)
          </p>
        )}
        <Select value={lostReason} onChange={(e) => setLostReason(e.target.value)}>
          <option value="">Escolha…</option>
          {(reasons?.items ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {r.parentId ? '— ' : ''}
              {r.name}
            </option>
          ))}
        </Select>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setLost(null)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            disabled={!lostReason}
            onClick={async () => {
              if (lost)
                await move(lost.leadId, lost.stageId, {
                  lostReasonId: lostReason,
                  suggestedByAi: !!suggestion && suggestion.reasonId === lostReason,
                })
              setLost(null)
              setLostReason('')
              setSuggestion(null)
            }}
          >
            Marcar como perdido
          </Button>
        </div>
      </Dialog>
    </div>
  )
}

function hoursInStage(lead: KanbanLead): number {
  return Math.round((Date.now() - new Date(lead.stageEnteredAt).getTime()) / 36e5)
}

/** SLA per stage (Configurações → Funil): a lead is overdue once it exceeds the stage's max hours. */
function isOverdue(lead: KanbanLead, stage: Stage): boolean {
  return !!stage.maxHoursInStage && hoursInStage(lead) >= stage.maxHoursInStage
}

function Column({
  stage,
  count,
  overdue,
  children,
}: {
  stage: Stage
  count: number
  overdue: number
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex w-64 shrink-0 flex-col rounded-xl border bg-slate-100/70',
        isOver && 'ring-2 ring-brand-400',
      )}
    >
      <header className="flex items-center justify-between px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold">
          <span className="h-2 w-2 rounded-full" style={{ background: stage.color ?? '#94a3b8' }} />
          {stage.name}
        </span>
        <span className="flex items-center gap-1">
          {overdue > 0 && (
            <span
              className="rounded-full bg-red-100 px-1.5 text-[10px] font-medium text-red-700"
              title={`${overdue} lead(s) acima de ${stage.maxHoursInStage}h neste estágio`}
            >
              {overdue} SLA
            </span>
          )}
          <span className="rounded-full bg-white px-1.5 text-[10px] text-muted">{count}</span>
        </span>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2 scroll-thin">{children}</div>
    </div>
  )
}

function CardItem({ lead, overdue }: { lead: KanbanLead; overdue: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id })
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined
  const hours = hoursInStage(lead)
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'cursor-grab rounded-lg border bg-white p-2.5 shadow-soft',
        overdue && 'border-red-300',
        isDragging && 'opacity-60',
      )}
    >
      <div className="flex items-center justify-between">
        <Link
          href={`/leads/${lead.id}`}
          className="truncate text-sm font-medium hover:underline"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {lead.contact.name ?? lead.contact.phone}
        </Link>
        <ScorePill score={lead.score} />
      </div>
      <p className="mt-0.5 truncate text-xs text-muted">
        {lead.interestProduct?.name ?? lead.recommendedProduct?.name ?? 'sem produto'}
      </p>
      {lead.nextBestAction && (
        <p className="mt-1 truncate text-[11px] text-brand-700">→ {lead.nextBestAction}</p>
      )}
      <div className="mt-2 flex items-center justify-between text-[10px] text-muted">
        <span className={cn(overdue && 'font-medium text-red-600')}>
          {hours < 48 ? `${hours}h no estágio` : `${Math.round(hours / 24)}d no estágio`}
          {overdue && ' · SLA'}
        </span>
        {lead.owner ? (
          <Avatar name={lead.owner.name} size="sm" />
        ) : (
          <span className="text-amber-600">sem dono</span>
        )}
      </div>
      <span className="sr-only">{relTime(lead.stageEnteredAt)}</span>
    </div>
  )
}
