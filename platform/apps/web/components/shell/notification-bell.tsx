'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { mutate } from 'swr'
import { api, useApi } from '@/lib/api'
import { cn } from '@/lib/utils'

interface Notification {
  id: string
  kind: string
  title: string
  body: string | null
  link: string | null
  readAt: string | null
  createdAt: string
}

const KIND_LABEL: Record<string, string> = {
  handoff: 'Atendimento humano',
  sla: 'SLA',
  visit_outcome: 'Visita',
  task: 'Tarefa',
  hot_lead: 'Lead quente',
  system: 'Sistema',
}

function ago(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (min < 1) return 'agora'
  if (min < 60) return `${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h`
  return `${Math.round(h / 24)} d`
}

/** Bell in the header: unread badge, last notifications, mark as read. Refreshed by SSE + polling. */
export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { data } = useApi<{ items: Notification[]; unread: number }>('notifications?limit=15', {
    refreshInterval: 60000,
  })
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const unread = data?.unread ?? 0
  const refresh = () =>
    mutate((k) => typeof k === 'string' && k.startsWith('notifications'), undefined, {
      revalidate: true,
    })
  const markRead = async (n: Notification) => {
    if (!n.readAt) {
      await api.post(`notifications/${n.id}/read`)
      await refresh()
    }
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={unread ? `${unread} notificações não lidas` : 'Notificações'}
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-80 overflow-hidden rounded-xl border bg-white shadow-lg">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-medium">Notificações</span>
            {unread > 0 && (
              <button
                type="button"
                className="text-xs text-brand-700 hover:underline"
                onClick={async () => {
                  await api.post('notifications/read-all')
                  await refresh()
                }}
              >
                Marcar todas como lidas
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-auto">
            {(data?.items ?? []).length === 0 && (
              <li className="px-3 py-6 text-center text-xs text-muted">Nada por aqui ainda.</li>
            )}
            {(data?.items ?? []).map((n) => {
              const inner = (
                <>
                  <div className="flex items-center gap-2 text-[11px] text-muted">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5">
                      {KIND_LABEL[n.kind] ?? n.kind}
                    </span>
                    <span>{ago(n.createdAt)}</span>
                    {!n.readAt && <span className="ml-auto h-2 w-2 rounded-full bg-brand-600" />}
                  </div>
                  <p className={cn('mt-0.5 text-sm', !n.readAt && 'font-medium')}>{n.title}</p>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{n.body}</p>}
                </>
              )
              const className = cn(
                'block w-full border-b px-3 py-2 text-left hover:bg-slate-50',
                !n.readAt && 'bg-brand-50/40',
              )
              return (
                <li key={n.id}>
                  {n.link ? (
                    <Link href={n.link} className={className} onClick={() => void markRead(n)}>
                      {inner}
                    </Link>
                  ) : (
                    <button type="button" className={className} onClick={() => void markRead(n)}>
                      {inner}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
