'use client'

import { useMemo, useState } from 'react'
import { Bot, Clock, Search, User } from 'lucide-react'
import { useApi } from '@/lib/api'
import { useSession } from '@/lib/session'
import { cn, relTime } from '@/lib/utils'
import type { ConversationListItem } from '@/lib/types'
import { Avatar, Badge, ScorePill, Skeleton, StageBadge } from '@/components/ui/primitives'

/** Channels with a 24h customer-service window (Meta): outside it only templates (WhatsApp) or a task */
const WINDOWED = ['whatsapp', 'instagram', 'messenger']

const FILTERS = [
  { key: 'all', label: 'Todas' },
  { key: 'ai', label: 'IA' },
  { key: 'human', label: 'Humano' },
  { key: 'mine', label: 'Minhas' },
] as const

export function ConversationList({
  selected,
  onSelect,
}: {
  selected: string | null
  onSelect: (id: string) => void
}) {
  const { unitId, me } = useSession()
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all')
  const [q, setQ] = useState('')
  const query = useMemo(() => {
    const p = new URLSearchParams({ limit: '100' })
    if (unitId) p.set('unitId', unitId)
    if (filter === 'ai' || filter === 'human') p.set('mode', filter)
    if (filter === 'mine' && me?.user) p.set('assigneeId', me.user.id)
    if (q.trim()) p.set('q', q.trim())
    return `conversations/?${p.toString()}`
  }, [unitId, filter, q, me])
  const { data, isLoading } = useApi<{ items: ConversationListItem[] }>(unitId ? query : null, {
    refreshInterval: 30000,
  })

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar nome ou telefone"
            className="h-9 w-full rounded-lg border bg-slate-50 pl-8 pr-3 text-sm outline-none focus:border-brand-500 focus:bg-white"
          />
        </div>
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                'rounded-md px-2 py-1 text-xs',
                filter === f.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scroll-thin">
        {isLoading && !data ? (
          <div className="space-y-2 p-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : !data?.items.length ? (
          <p className="p-6 text-center text-xs text-muted">
            Nenhuma conversa. Use o simulador ou o Playground para gerar leads.
          </p>
        ) : (
          data.items.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className={cn(
                'flex w-full gap-2.5 border-b px-3 py-2.5 text-left transition hover:bg-slate-50',
                selected === c.id && 'bg-brand-50/60',
              )}
            >
              <Avatar name={c.contact.name ?? c.contact.phone} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={cn(
                      'truncate text-sm',
                      c.unreadCount ? 'font-semibold' : 'font-medium',
                    )}
                  >
                    {c.contact.name ?? c.contact.phone ?? 'Sem nome'}
                  </p>
                  <span className="shrink-0 text-[10px] text-muted">
                    {relTime(c.lastMessageAt)}
                  </span>
                </div>
                <p className="truncate text-xs text-muted">{c.lastMessagePreview ?? '—'}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {c.lead && <StageBadge name={c.lead.stage.name} color={c.lead.stage.color} />}
                  {c.lead && <ScorePill score={c.lead.score} />}
                  {c.mode === 'ai' ? (
                    <Badge tone="brand">
                      <Bot className="h-3 w-3" /> IA
                    </Badge>
                  ) : (
                    <Badge tone="amber">
                      <User className="h-3 w-3" /> {c.assignee?.name?.split(' ')[0] ?? 'Humano'}
                    </Badge>
                  )}
                  {c.windowRemainingMin === 0 && WINDOWED.includes(c.channel.kind) && (
                    <Badge tone="red">
                      <Clock className="h-3 w-3" /> 24h
                    </Badge>
                  )}
                  {c.unreadCount > 0 && (
                    <span className="ml-auto rounded-full bg-brand-600 px-1.5 text-[10px] font-semibold text-white">
                      {c.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
