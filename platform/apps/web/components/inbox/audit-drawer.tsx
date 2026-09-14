'use client'

import { useApi } from '@/lib/api'
import { DECISION_LABELS, INTENT_LABELS } from '@/lib/utils'
import type { AgentRunRow } from '@/lib/types'
import { Badge, Dialog } from '@/components/ui/primitives'

export function AuditDrawer({ runId, onClose }: { runId: string; onClose: () => void }) {
  const { data } = useApi<{
    run: AgentRunRow
    knowledge: Array<{
      id: string
      content: string
      document: { title: string; version: number; category: string }
    }>
  }>(`analytics/agent-runs/${runId}`)
  return (
    <Dialog open onClose={onClose} title="Auditoria da resposta da IA" wide>
      {!data ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : (
        <RunDetails run={data.run} knowledge={data.knowledge} />
      )}
    </Dialog>
  )
}

export function RunDetails({
  run,
  knowledge,
}: {
  run: AgentRunRow
  knowledge: Array<{
    id: string
    content: string
    document: { title: string; version: number; category: string }
  }>
}) {
  const decisionTone =
    run.decision === 'reply'
      ? 'green'
      : run.decision === 'handoff'
        ? 'amber'
        : run.decision === 'blocked'
          ? 'red'
          : 'slate'
  return (
    <div className="grid gap-4 text-sm md:grid-cols-2">
      <div className="space-y-3">
        <Row label="Decisão">
          <Badge tone={decisionTone}>{DECISION_LABELS[run.decision ?? ''] ?? run.decision}</Badge>{' '}
          {run.decisionReason && <span className="text-xs text-muted">({run.decisionReason})</span>}
        </Row>
        <Row label="Intenção">
          {run.classification
            ? `${INTENT_LABELS[run.classification.intent] ?? run.classification.intent} · ${run.classification.sentiment} · urgência ${run.classification.urgency}`
            : '—'}
          {run.classification?.signals.length ? (
            <p className="text-xs text-muted">sinais: {run.classification.signals.join(', ')}</p>
          ) : null}
        </Row>
        <Row label="Fatos extraídos">
          {run.extractedFacts?.facts.length ? (
            run.extractedFacts.facts.map((f, i) => (
              <p key={i} className="text-xs">
                {f.key} = {f.value} <span className="text-muted">({f.source})</span>
              </p>
            ))
          ) : (
            <span className="text-muted">nenhum</span>
          )}
        </Row>
        <Row label="Confiança / retrieval">
          {run.confidence !== null ? `${Math.round(run.confidence * 100)}%` : '—'} · retrieval{' '}
          {run.retrievalScore !== null ? run.retrievalScore.toFixed(2) : '—'}
        </Row>
        <Row label="Validação">
          {run.validation ? (
            run.validation.issues.length ? (
              <ul className="space-y-0.5 text-xs">
                {run.validation.issues.map((i, idx) => (
                  <li key={idx}>
                    <Badge
                      tone={
                        i.severity === 'block' ? 'red' : i.severity === 'warn' ? 'amber' : 'slate'
                      }
                    >
                      {i.severity}
                    </Badge>{' '}
                    {i.code}: {i.message}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-emerald-700">sem ressalvas</span>
            )
          ) : (
            '—'
          )}
        </Row>
        <Row label="Modelo / custo">
          {run.model ?? '—'} · {run.inputTokens}/{run.outputTokens} tokens · $
          {Number(run.costUsd).toFixed(5)} · {run.latencyMs} ms
        </Row>
        <Row label="Versões de prompt">
          {Object.entries(run.promptVersions ?? {})
            .map(([k, v]) => `${k}@v${v}`)
            .join(', ') || '—'}
        </Row>
        <Row label="Etapas">
          <div className="flex flex-wrap gap-1">
            {run.steps.map((s, i) => (
              <span
                key={i}
                className={`rounded border px-1.5 py-0.5 text-[10px] ${s.skipped ? 'text-slate-400 line-through' : ''}`}
                title={s.model ? `${s.model} ${s.tokensIn}/${s.tokensOut}` : ''}
              >
                {s.name} {s.skipped ? '' : `${s.ms}ms`}
              </span>
            ))}
          </div>
        </Row>
      </div>
      <div className="space-y-3">
        <Row label="Resposta">
          <p className="whitespace-pre-wrap rounded-md bg-slate-50 p-2 text-xs">
            {run.replyText ?? '—'}
          </p>
        </Row>
        <Row label={`Fontes de conhecimento (${knowledge.length})`}>
          {knowledge.length ? (
            <div className="space-y-1.5">
              {knowledge.map((k) => (
                <details key={k.id} className="rounded-md border p-2 text-xs">
                  <summary className="cursor-pointer font-medium">
                    {k.document.title}{' '}
                    <span className="text-muted">
                      v{k.document.version} · {k.document.category}
                    </span>
                  </summary>
                  <p className="mt-1 whitespace-pre-wrap text-slate-600">{k.content}</p>
                </details>
              ))}
            </div>
          ) : (
            <span className="text-muted">nenhuma (resposta não dependeu de documentos)</span>
          )}
        </Row>
        <Row label={`Ferramentas (${run.toolCalls.length})`}>
          {run.toolCalls.map((t) => (
            <details key={t.id} className="rounded-md border p-2 text-xs">
              <summary className="cursor-pointer font-medium">
                {t.name} · {t.durationMs} ms {t.error && <span className="text-red-600">erro</span>}
              </summary>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap text-[10px] text-slate-600">
                {JSON.stringify({ input: t.input, output: t.output, error: t.error }, null, 1)}
              </pre>
            </details>
          ))}
        </Row>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  )
}
