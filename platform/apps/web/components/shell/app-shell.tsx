'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  BookOpen,
  Bot,
  Columns3,
  FlaskConical,
  Inbox,
  LogOut,
  Package,
  Settings,
  Sparkles,
  Megaphone,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SessionProvider, useSession } from '@/lib/session'
import { useRealtime } from '@/lib/realtime'
import { Avatar, Select } from '@/components/ui/primitives'
import { NotificationBell } from './notification-bell'
import { logoutAction } from '@/app/login/actions'

const NAV = [
  { href: '/inbox', label: 'Inbox', icon: Inbox, min: 'viewer' },
  { href: '/kanban', label: 'Funil', icon: Columns3, min: 'viewer' },
  { href: '/products', label: 'Produtos', icon: Package, min: 'viewer' },
  { href: '/knowledge', label: 'Conhecimento', icon: BookOpen, min: 'viewer' },
  { href: '/prompts', label: 'Agente', icon: Bot, min: 'manager' },
  { href: '/playground', label: 'Playground', icon: FlaskConical, min: 'manager' },
  { href: '/campaigns', label: 'Campanhas', icon: Megaphone, min: 'manager' },
  { href: '/analytics', label: 'Analytics', icon: BarChart3, min: 'manager' },
  { href: '/settings', label: 'Configurações', icon: Settings, min: 'manager' },
] as const

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { me, unitId, setUnitId, can } = useSession()
  useRealtime(unitId || undefined)
  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-56 shrink-0 flex-col border-r bg-white">
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            V
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">VOX2you</p>
            <p className="text-[11px] text-muted">CRM conversacional</p>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-2">
          {NAV.filter((n) => can(n.min)).map((n) => {
            const active = pathname === n.href || pathname.startsWith(`${n.href}/`)
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition',
                  active
                    ? 'bg-brand-50 font-medium text-brand-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-ink',
                )}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            )
          })}
        </nav>
        <div className="border-t px-3 py-3">
          {me?.providers.pendingCredentials.length ? (
            <p
              className="mb-2 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800"
              title={me.providers.pendingCredentials.join(', ')}
            >
              <Sparkles className="mr-1 inline h-3 w-3" />
              Modo simulação: {me.providers.pendingCredentials.length} credencial(is) pendente(s)
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <Avatar name={me?.user?.name} size="sm" />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-xs font-medium">{me?.user?.name ?? '…'}</p>
              <p className="truncate text-[11px] text-muted">{me?.role}</p>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-md p-1 text-muted hover:bg-slate-100 hover:text-ink"
                title="Sair"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b bg-white px-4">
          <div className="text-sm font-medium text-slate-700">
            {NAV.find((n) => pathname.startsWith(n.href))?.label ?? ''}
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <span className="text-xs text-muted">Unidade</span>
            <Select className="h-8 w-48" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              {(me?.units ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <Shell>{children}</Shell>
    </SessionProvider>
  )
}
