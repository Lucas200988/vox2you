'use client'

import { useEffect, useRef, useState } from 'react'
import { mutate } from 'swr'
import {
  Bot,
  Check,
  CheckCheck,
  Mic,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  User,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react'
import { api, useApi } from '@/lib/api'
import { cn, fmtDate } from '@/lib/utils'
import type { ConversationDetail, Message } from '@/lib/types'
import { Badge, Button, Select, Textarea, useToast } from '@/components/ui/primitives'
import { CopilotPanel } from './copilot-panel'
import { AuditDrawer } from './audit-drawer'

/** Channels with a 24h customer-service window (Meta): outside it only templates (WhatsApp) or a task */
const WINDOWED = ['whatsapp', 'instagram', 'messenger']

export function MessageThread({ conversationId }: { conversationId: string }) {
  const { data: conv } = useApi<ConversationDetail>(`conversations/${conversationId}`)
  const { data: msgs } = useApi<{ items: Message[] }>(`conversations/${conversationId}/messages`, {
    refreshInterval: 15000,
  })
  const { data: templates } = useApi<{
    items: Array<{
      name: string
      language: string
      status: string
      body: string | null
      variables: string[]
    }>
  }>('templates')
  const [text, setText] = useState('')
  const [template, setTemplate] = useState('')
  const [vars, setVars] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [copilotOpen, setCopilotOpen] = useState(false)
  const [audit, setAudit] = useState<string | null>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const toast = useToast()

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [msgs?.items.length])
  useEffect(() => {
    void api
      .post(`conversations/${conversationId}/read`)
      .then(() => mutate((k) => typeof k === 'string' && k.startsWith('conversations/?')))
  }, [conversationId])

  if (!conv) return <div className="p-6 text-sm text-muted">Carregando…</div>
  const windowOpen = !WINDOWED.includes(conv.channel.kind) || conv.windowRemainingMin > 0
  const isHuman = conv.mode === 'human'
  const approved = (templates?.items ?? []).filter((t) => t.status === 'approved')

  async function setMode(mode: 'ai' | 'human') {
    await api.post(`conversations/${conversationId}/mode`, { mode })
    await mutate(`conversations/${conversationId}`)
    await mutate((k) => typeof k === 'string' && k.startsWith('conversations/?'))
    toast.show(
      mode === 'human'
        ? 'Você assumiu a conversa. A IA está pausada.'
        : 'IA retomou o atendimento com o contexto atual.',
    )
  }

  async function send() {
    if (sending) return
    setSending(true)
    try {
      if (!windowOpen) {
        if (!template)
          return toast.show('Escolha um template aprovado (janela de 24h fechada).', 'err')
        await api.post(`conversations/${conversationId}/messages`, {
          templateName: template,
          templateVariables: vars,
        })
      } else {
        if (!text.trim()) return
        await api.post(`conversations/${conversationId}/messages`, { text: text.trim() })
      }
      setText('')
      await mutate(`conversations/${conversationId}/messages`)
    } catch (e) {
      toast.show((e as Error).message, 'err')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b bg-white px-4 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {conv.contact.name ?? conv.contact.phone}
          </p>
          <p className="text-[11px] text-muted">
            {conv.channel.name} · {conv.contact.phone}{' '}
            {conv.channel.kind === 'whatsapp' &&
              (windowOpen
                ? `· janela: ${Math.floor(conv.windowRemainingMin / 60)}h${conv.windowRemainingMin % 60}m`
                : '· janela 24h fechada')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isHuman ? (
            <>
              <Badge tone="amber">
                <User className="h-3 w-3" /> {conv.assignee?.name ?? 'Humano'}
              </Badge>
              <Button size="sm" variant="secondary" onClick={() => setMode('ai')}>
                <Bot className="h-3.5 w-3.5" /> Devolver para IA
              </Button>
            </>
          ) : (
            <>
              <Badge tone="brand">
                <Bot className="h-3 w-3" /> IA ativa
              </Badge>
              <Button size="sm" variant="secondary" onClick={() => setMode('human')}>
                <User className="h-3.5 w-3.5" /> Assumir conversa
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant={copilotOpen ? 'subtle' : 'ghost'}
            onClick={() => setCopilotOpen((v) => !v)}
            title="Copilot do vendedor"
          >
            <Sparkles className="h-3.5 w-3.5" /> Copilot
          </Button>
        </div>
      </header>
      {conv.handoffReason && isHuman && (
        <div className="border-b bg-amber-50 px-4 py-2 text-xs text-amber-900">
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5" /> Transferido pela IA:{' '}
          {conv.handoffReason}
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4 scroll-thin">
            {(msgs?.items ?? []).map((m) => (
              <Bubble
                key={m.id}
                m={m}
                tz={conv.unit.timezone}
                onAudit={() => m.agentRun && setAudit(m.agentRun.id)}
                onFeedback={(rating) =>
                  api
                    .post(`conversations/messages/${m.id}/feedback`, { rating })
                    .then(() => toast.show('Feedback registrado'))
                }
              />
            ))}
            <div ref={bottom} />
          </div>
          <div className="border-t bg-white p-3">
            {!isHuman && (
              <p className="mb-2 text-[11px] text-muted">
                A IA está respondendo. Para enviar manualmente, assuma a conversa.
              </p>
            )}
            {!windowOpen ? (
              <div className="space-y-2">
                <p className="text-xs text-amber-800">
                  Janela de 24h fechada — apenas templates aprovados podem ser enviados.
                </p>
                <Select
                  value={template}
                  onChange={(e) => {
                    setTemplate(e.target.value)
                    const t = approved.find((x) => x.name === e.target.value)
                    setVars(new Array(t?.variables.length ?? 0).fill(''))
                  }}
                >
                  <option value="">Escolha um template…</option>
                  {approved.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name} ({t.language})
                    </option>
                  ))}
                </Select>
                {template && (
                  <p className="rounded-md bg-slate-50 p-2 text-xs text-slate-600">
                    {approved.find((t) => t.name === template)?.body}
                  </p>
                )}
                {vars.map((v, i) => (
                  <input
                    key={i}
                    value={v}
                    onChange={(e) => setVars(vars.map((x, j) => (j === i ? e.target.value : x)))}
                    placeholder={`Variável {{${i + 1}}}`}
                    className="h-8 w-full rounded-md border px-2 text-xs"
                  />
                ))}
                <Button size="sm" onClick={send} disabled={sending || !isHuman}>
                  <Send className="h-3.5 w-3.5" /> Enviar template
                </Button>
              </div>
            ) : (
              <div className="flex items-end gap-2">
                <Textarea
                  rows={2}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={!isHuman}
                  placeholder={
                    isHuman
                      ? 'Escreva sua mensagem… (Enter envia, Shift+Enter quebra linha)'
                      : 'Assuma a conversa para escrever'
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void send()
                    }
                  }}
                />
                <Button onClick={send} disabled={sending || !isHuman || !text.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
        {copilotOpen && (
          <CopilotPanel
            conversationId={conversationId}
            onUseDraft={(t) => setText(t)}
            onClose={() => setCopilotOpen(false)}
          />
        )}
      </div>
      {audit && <AuditDrawer runId={audit} onClose={() => setAudit(null)} />}
      {toast.node}
    </div>
  )
}

function Bubble({
  m,
  tz,
  onAudit,
  onFeedback,
}: {
  m: Message
  tz: string
  onAudit: () => void
  onFeedback: (rating: 1 | -1) => void
}) {
  const out = m.direction === 'outbound'
  const body = m.text ?? m.transcript ?? `[${m.type}]`
  const StatusIcon =
    m.status === 'read'
      ? CheckCheck
      : m.status === 'delivered'
        ? CheckCheck
        : m.status === 'sent'
          ? Check
          : null
  return (
    <div className={cn('flex', out ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[72%] rounded-2xl px-3.5 py-2 text-sm shadow-sm',
          out
            ? m.authorType === 'agent'
              ? 'bg-brand-600 text-white'
              : 'bg-slate-800 text-white'
            : 'bg-white',
        )}
      >
        {m.type === 'audio' && (
          <p
            className={cn(
              'mb-1 flex items-center gap-1 text-[11px]',
              out ? 'text-white/80' : 'text-muted',
            )}
          >
            <Mic className="h-3 w-3" /> Áudio transcrito
          </p>
        )}
        {m.type === 'template' && (
          <p className="mb-1 text-[11px] text-white/80">Template: {m.templateName}</p>
        )}
        <p className="whitespace-pre-wrap break-words">{body}</p>
        <div
          className={cn(
            'mt-1 flex items-center justify-end gap-2 text-[10px]',
            out ? 'text-white/75' : 'text-muted',
          )}
        >
          {out &&
            (m.authorType === 'agent' ? (
              <span className="inline-flex items-center gap-0.5">
                <Bot className="h-3 w-3" /> IA
              </span>
            ) : (
              <span>{m.authorUser?.name ?? 'Equipe'}</span>
            ))}
          <span>{fmtDate(m.createdAt, { hour: '2-digit', minute: '2-digit' }, tz)}</span>
          {out && StatusIcon && (
            <StatusIcon className={cn('h-3 w-3', m.status === 'read' && 'text-sky-200')} />
          )}
          {out && m.status === 'failed' && (
            <span className="text-red-200">falhou{m.errorTitle ? `: ${m.errorTitle}` : ''}</span>
          )}
        </div>
        {out && m.agentRun && (
          <div className="mt-1 flex items-center gap-1 border-t border-white/20 pt-1 text-[10px] text-white/80">
            <button
              type="button"
              onClick={onAudit}
              className="inline-flex items-center gap-1 hover:text-white"
              title="Ver auditoria da IA"
            >
              <ShieldCheck className="h-3 w-3" /> conf.{' '}
              {m.agentRun.confidence !== null ? Math.round(m.agentRun.confidence * 100) : '—'}% ·{' '}
              {m.agentRun.latencyMs}ms · ${Number(m.agentRun.costUsd).toFixed(4)}
            </button>
            <span className="ml-auto flex gap-1">
              <button
                type="button"
                onClick={() => onFeedback(1)}
                title="Boa resposta"
                className="hover:text-white"
              >
                <ThumbsUp className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => onFeedback(-1)}
                title="Resposta ruim"
                className="hover:text-white"
              >
                <ThumbsDown className="h-3 w-3" />
              </button>
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
