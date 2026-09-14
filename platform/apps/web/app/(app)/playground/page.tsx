'use client'

import { useState } from 'react'
import { Bot, RefreshCw, Send, User } from 'lucide-react'
import { api } from '@/lib/api'
import { useSession } from '@/lib/session'
import { DECISION_LABELS, INTENT_LABELS, cn } from '@/lib/utils'
import type { AgentRunRow } from '@/lib/types'
import { Badge, Button, Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { RunDetails } from '@/components/inbox/audit-drawer'

interface RunResult {
  conversationId: string
  run: {
    reply: string | null
    decision: string
    decisionReason: string | null
    classification: { intent: string; signals: string[]; sentiment: string } | null
    extraction: { facts: Array<{ key: string; value: string; source: string }> } | null
    confidence: number
    retrievalConfidence: number
    latencyMs: number
    usage: { inputTokens: number; outputTokens: number; costUsd: number }
    score: number | null
    scoreReasons: string[]
    stage: string | null
    nextBestAction: string | null
    followUpAt: string | null
    handoffReason: string | null
    validation: {
      ok: boolean
      issues: Array<{ code: string; severity: string; message: string }>
    } | null
  }
  runRow: AgentRunRow
  knowledge: Array<{
    id: string
    content: string
    document: { title: string; version: number; category: string }
  }>
  wallMs: number
}

export default function PlaygroundPage() {
  const { unitId } = useSession()
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<
    Array<{ role: 'customer' | 'agent'; text: string; meta?: string }>
  >([])
  const [text, setText] = useState('')
  const [persona, setPersona] = useState('')
  const [promptVersion, setPromptVersion] = useState('')
  const [model, setModel] = useState('')
  const [env, setEnv] = useState<'production' | 'staging'>('production')
  const [facts, setFacts] = useState('')
  const [last, setLast] = useState<RunResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    if (!text.trim() || busy) return
    setBusy(true)
    setError(null)
    const customer = text.trim()
    setMessages((m) => [...m, { role: 'customer', text: customer }])
    setText('')
    try {
      const seedFacts = facts
        .split('\n')
        .map((l) => l.split('=').map((s) => s.trim()))
        .filter((p) => p.length === 2 && p[0] && p[1])
        .map(([key, value]) => ({ key: key!, value: value! }))
      const res = await api.post<RunResult>('playground/run', {
        unitId,
        text: customer,
        conversationId: conversationId ?? undefined,
        persona: persona || undefined,
        promptVersion: promptVersion ? Number(promptVersion) : undefined,
        model: model || undefined,
        env,
        facts: !conversationId && seedFacts.length ? seedFacts : undefined,
      })
      setConversationId(res.conversationId)
      setLast(res)
      setMessages((m) => [
        ...m,
        {
          role: 'agent',
          text:
            res.run.reply ??
            `(sem resposta — ${DECISION_LABELS[res.run.decision] ?? res.run.decision})`,
          meta: `${DECISION_LABELS[res.run.decision] ?? res.run.decision} · ${res.run.latencyMs}ms · $${res.run.usage.costUsd.toFixed(4)}`,
        },
      ])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full">
      <aside className="w-72 shrink-0 space-y-3 overflow-y-auto border-r bg-white p-4 scroll-thin">
        <h1 className="text-sm font-semibold">Playground do agente</h1>
        <p className="text-[11px] text-muted">
          Simule conversas antes de publicar mudanças. Nada é enviado ao WhatsApp; o lead fica em um
          sandbox.
        </p>
        <Field label="Ambiente de prompts">
          <Select value={env} onChange={(e) => setEnv(e.target.value as 'production' | 'staging')}>
            <option value="production">produção</option>
            <option value="staging">staging</option>
          </Select>
        </Field>
        <Field label="Versão do prompt principal (opcional)">
          <Input
            value={promptVersion}
            onChange={(e) => setPromptVersion(e.target.value)}
            placeholder="ex.: 2"
          />
        </Field>
        <Field label="Modelo (opcional)">
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="ex.: claude-opus-5"
          />
        </Field>
        <Field label="Persona (override)">
          <Textarea
            rows={3}
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            placeholder="Consultora acolhedora e direta…"
          />
        </Field>
        <Field
          label="Fatos iniciais (key=valor por linha)"
          hint="Aplicados só ao iniciar a conversa"
        >
          <Textarea
            rows={3}
            value={facts}
            onChange={(e) => setFacts(e.target.value)}
            placeholder={'pain=vergonha de falar\npreferred_period=noite'}
          />
        </Field>
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => {
            setConversationId(null)
            setMessages([])
            setLast(null)
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" /> Nova conversa
        </Button>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 space-y-2 overflow-y-auto p-4 scroll-thin">
          {messages.length === 0 && (
            <p className="text-center text-xs text-muted">
              Escreva como um cliente: "queria saber como funciona o curso", "quanto custa?", "achei
              caro"…
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn('flex', m.role === 'agent' ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm',
                  m.role === 'agent' ? 'bg-brand-600 text-white' : 'bg-white',
                )}
              >
                <p className="mb-0.5 flex items-center gap-1 text-[10px] opacity-75">
                  {m.role === 'agent' ? (
                    <>
                      <Bot className="h-3 w-3" /> agente
                    </>
                  ) : (
                    <>
                      <User className="h-3 w-3" /> cliente
                    </>
                  )}
                </p>
                <p className="whitespace-pre-wrap">{m.text}</p>
                {m.meta && <p className="mt-1 text-[10px] opacity-75">{m.meta}</p>}
              </div>
            </div>
          ))}
          {error && <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">{error}</p>}
        </div>
        <div className="flex gap-2 border-t bg-white p-3">
          <Textarea
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Mensagem do cliente"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
          />
          <Button onClick={send} disabled={busy || !unitId}>
            {busy ? '…' : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      <aside className="w-[26rem] shrink-0 overflow-y-auto border-l bg-white p-4 text-sm scroll-thin">
        <h2 className="mb-2 text-sm font-semibold">Inspetor</h2>
        {!last ? (
          <p className="text-xs text-muted">
            Envie uma mensagem para ver classificação, fatos, retrieval, ferramentas, validação e
            custo.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1">
              <Badge
                tone={
                  last.run.decision === 'reply'
                    ? 'green'
                    : last.run.decision === 'handoff'
                      ? 'amber'
                      : 'red'
                }
              >
                {DECISION_LABELS[last.run.decision] ?? last.run.decision}
              </Badge>
              {last.run.classification && (
                <Badge tone="brand">
                  {INTENT_LABELS[last.run.classification.intent] ?? last.run.classification.intent}
                </Badge>
              )}
              {last.run.classification?.signals.map((s) => (
                <Badge key={s} tone="violet">
                  {s}
                </Badge>
              ))}
              <Badge tone="slate">conf. {Math.round(last.run.confidence * 100)}%</Badge>
              <Badge tone="slate">{last.wallMs} ms</Badge>
            </div>
            {last.run.handoffReason && (
              <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
                Handoff: {last.run.handoffReason}
              </p>
            )}
            <div className="rounded-md border p-2 text-xs">
              <p>
                <span className="text-muted">Estágio:</span> {last.run.stage} ·{' '}
                <span className="text-muted">Score:</span> {last.run.score}
              </p>
              {last.run.scoreReasons.length > 0 && (
                <ul className="mt-1 list-disc pl-4 text-slate-600">
                  {last.run.scoreReasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
              <p className="mt-1">
                <span className="text-muted">NBA:</span> {last.run.nextBestAction}
              </p>
              {last.run.followUpAt && (
                <p>
                  <span className="text-muted">Follow-up:</span>{' '}
                  {new Date(last.run.followUpAt).toLocaleString('pt-BR')}
                </p>
              )}
            </div>
            <RunDetails run={last.runRow} knowledge={last.knowledge} />
          </div>
        )}
      </aside>
    </div>
  )
}
