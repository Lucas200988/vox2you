'use client'

import * as React from 'react'
import { cn, initials } from '@/lib/utils'

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-9 w-full rounded-lg border bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50',
        className,
      )}
      {...props}
    />
  )
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50',
        className,
      )}
      {...props}
    />
  )
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-9 w-full rounded-lg border bg-white px-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1 block text-xs font-medium text-muted', className)} {...props} />
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
    </div>
  )
}

export function Badge({
  className,
  tone = 'slate',
  children,
  style,
}: {
  className?: string
  tone?: 'slate' | 'brand' | 'green' | 'amber' | 'red' | 'blue' | 'violet'
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    brand: 'bg-brand-50 text-brand-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    blue: 'bg-sky-50 text-sky-700',
    violet: 'bg-violet-50 text-violet-700',
  }
  return (
    <span
      style={style}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function StageBadge({ name, color }: { name: string; color?: string | null }) {
  const c = color ?? '#94a3b8'
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px] font-medium"
      style={{ borderColor: `${c}55`, color: c, background: `${c}14` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      {name}
    </span>
  )
}

export function Card({
  className,
  children,
  title,
  actions,
}: {
  className?: string
  children: React.ReactNode
  title?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <section className={cn('rounded-xl border bg-white shadow-soft', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between border-b px-4 py-2.5">
          <h3 className="text-sm font-semibold">{title}</h3>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

export function Avatar({
  name,
  size = 'md',
  className,
}: {
  name: string | null | undefined
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const s = { sm: 'h-6 w-6 text-[10px]', md: 'h-8 w-8 text-xs', lg: 'h-10 w-10 text-sm' }[size]
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-slate-200 font-semibold text-slate-700',
        s,
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse-soft rounded-md bg-slate-200', className)} />
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string
  hint?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="max-w-sm text-xs text-muted">{hint}</p>}
      {action}
    </div>
  )
}

export function ScorePill({ score }: { score: number }) {
  const tone = score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-slate-400'
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700"
      title="Lead score"
    >
      <span className={cn('h-2 w-2 rounded-full', tone)} />
      {score}
    </span>
  )
}

export function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ key: string; label: string; count?: number }>
  value: string
  onChange: (k: string) => void
}) {
  return (
    <div className="flex gap-1 border-b">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={cn(
            '-mb-px border-b-2 px-3 py-2 text-sm',
            value === t.key
              ? 'border-brand-600 font-medium text-brand-700'
              : 'border-transparent text-muted hover:text-ink',
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-[10px] text-slate-600">
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  wide?: boolean
}) {
  const ref = React.useRef<HTMLDialogElement>(null)
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className={cn(
        'm-auto w-[calc(100%-2rem)] rounded-2xl border bg-white p-0 shadow-xl backdrop:bg-slate-900/40',
        wide ? 'max-w-4xl' : 'max-w-lg',
      )}
    >
      {open && (
        <div>
          <header className="flex items-center justify-between border-b px-5 py-3">
            <h2 className="text-sm font-semibold">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 text-muted hover:bg-slate-100"
              aria-label="Fechar"
            >
              ✕
            </button>
          </header>
          <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
        </div>
      )}
    </dialog>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
      <span
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-5 w-9 items-center rounded-full transition',
          checked ? 'bg-brand-600' : 'bg-slate-300',
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 rounded-full bg-white shadow transition',
            checked ? 'translate-x-4' : 'translate-x-0.5',
          )}
        />
      </span>
      {label}
    </label>
  )
}

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: React.ReactNode
  hint?: string
  tone?: 'brand' | 'green' | 'amber'
}) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-soft">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={cn(
          'mt-1 text-2xl font-semibold tracking-tight',
          tone === 'green' && 'text-emerald-700',
          tone === 'amber' && 'text-amber-700',
          tone === 'brand' && 'text-brand-700',
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  )
}

export function useToast() {
  const [msg, setMsg] = React.useState<{ text: string; tone: 'ok' | 'err' } | null>(null)
  const show = React.useCallback((text: string, tone: 'ok' | 'err' = 'ok') => {
    setMsg({ text, tone })
    setTimeout(() => setMsg(null), 3500)
  }, [])
  const node = msg ? (
    <div
      className={cn(
        'fixed bottom-4 right-4 z-50 rounded-lg px-4 py-2 text-sm text-white shadow-lg',
        msg.tone === 'ok' ? 'bg-slate-900' : 'bg-red-600',
      )}
    >
      {msg.text}
    </div>
  ) : null
  return { show, node }
}

export { Button } from './button'
