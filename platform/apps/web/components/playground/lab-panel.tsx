'use client'

import { useState } from 'react'
import { mutate } from 'swr'
import { api, useApi } from '@/lib/api'
import { DECISION_LABELS, INTENT_LABELS, cn } from '@/lib/utils'
import { Badge, Button, Dialog, Field, Input, Select, useToast } from '@/components/ui/primitives'

export interface LabConfig {
  promptVersion?: number
  model?: string
  persona?: string
  env?: 'production' | 'staging'
}

interface Side {
  conversationId: string
  reply: string | null
  decision: string
  decisionReason: string | null
  intent: string | null
  confidence: number
  latencyMs: number
  costUsd: number
  model: string | null
  validation: { ok: boolean; issues: Array<{ code: string; message: string }> } | null
}
interface ItemResult {
  itemId: string
  text: string
  reply: string | null
  decision: string
  intent: string | null
  latencyMs: number
  costUsd: number
  passed: boolean
  failures: string[]
}
interface RunSummary {
  config: { label?: string; promptVersion?: number; model?: string }
  items: number
  passed: number
  passRate: number
  avgLatencyMs: number
  totalCostUsd: number
  blocked: number
  handoffs: number
  results: ItemResult[]
}
interface Dataset {
  id: string
  name: string
  _count: { items: number }
}

/**
 * Laboratório do playground: comparação A/B do turno atual e datasets de regressão (salvar a
 * conversa como caso, rodar e comparar configurações).
 */
export function LabPanel({
  unitId,
  text,
  facts,
  conversationId,
  config,
}: {
  unitId: string
  text: string
  facts: Array<{ key: string; value: string }>
  conversationId: string | null
  config: LabConfig
}) {
  const toast = useToast()
  const [versionB, setVersionB] = useState('')
  const [modelB, setModelB] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [compare, setCompare] = useState<{ a: Side; b: Side; same: boolean } | null>(null)
  const [runs, setRuns] = useState<{ a: RunSummary; b?: RunSummary; winner?: string } | null>(null)
  const { data: datasets } = useApi<{ items: Dataset[] }>('datasets')
  const [datasetId, setDatasetId] = useState('')
  const [newName, setNewName] = useState('')
  const [mustNotMatch, setMustNotMatch] = useState('R\\$')

  const configB = (): LabConfig => ({
    ...config,
    promptVersion: versionB ? Number(versionB) : config.promptVersion,
    model: modelB || config.model,
  })
  const refreshDatasets = () =>
    mutate((k) => typeof k === 'string' && k.startsWith('datasets'), undefined, {
      revalidate: true,
    })

  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name)
    try {
      await fn()
    } catch (e) {
      toast.show((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const compareTurn = () =>
    run('compare', async () => {
      if (!text.trim())
        throw new Error('Escreva a mensagem do cliente no campo de envio antes de comparar')
      const r = await api.post<{ a: Side; b: Side; same: boolean }>('playground/compare', {
        unitId,
        text: text.trim(),
        facts: facts.length ? facts : undefined,
        a: { ...config, label: 'A' },
        b: { ...configB(), label: 'B' },
      })
      setCompare(r)
    })

  const createDataset = () =>
    run('create', async () => {
      const d = await api.post<Dataset>('datasets', { name: newName.trim() })
      await refreshDatasets()
      setDatasetId(d.id)
      setNewName('')
      toast.show('Dataset criado')
    })

  const saveCase = () =>
    run('save', async () => {
      if (!datasetId || !conversationId)
        throw new Error('Escolha um dataset e tenha uma conversa em andamento')
      await api.post(`datasets/${datasetId}/items/from-conversation`, {
        conversationId,
        expected: mustNotMatch.trim() ? { mustNotMatch: [mustNotMatch.trim()] } : undefined,
      })
      await refreshDatasets()
      toast.show('Última mensagem da conversa salva como caso de teste')
    })

  const runDataset = () =>
    run('run', async () => {
      if (!datasetId) throw new Error('Escolha um dataset')
      const a = await api.post<RunSummary>(`datasets/${datasetId}/run`, {
        unitId,
        label: 'A',
        ...config,
      })
      setRuns({ a })
    })

  const compareDataset = () =>
    run('runab', async () => {
      if (!datasetId) throw new Error('Escolha um dataset')
      const r = await api.post<{ a: RunSummary; b: RunSummary; winner: string }>(
        `datasets/${datasetId}/compare`,
        {
          a: { unitId, label: 'A', ...config },
          b: { unitId, label: 'B', ...configB() },
        },
      )
      setRuns(r)
    })

  return (
    <div className="space-y-3 border-t pt-3">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Comparar A × B</h3>
        <p className="text-[11px] text-muted">A = configuração acima. Defina só o que muda em B.</p>
      </div>
      <Field label="Versão do prompt (B)">
        <Input
          value={versionB}
          onChange={(e) => setVersionB(e.target.value)}
          placeholder="ex.: 3"
        />
      </Field>
      <Field label="Modelo (B)">
        <Input
          value={modelB}
          onChange={(e) => setModelB(e.target.value)}
          placeholder="ex.: claude-sonnet-5"
        />
      </Field>
      <Button
        variant="secondary"
        className="w-full"
        onClick={compareTurn}
        disabled={!!busy || !unitId}
      >
        {busy === 'compare' ? 'Comparando…' : 'Comparar a mensagem atual'}
      </Button>

      <div className="pt-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Casos de teste</h3>
        <p className="text-[11px] text-muted">
          Salve conversas como casos com expectativas e rode-os a cada mudança de prompt ou modelo.
        </p>
      </div>
      <Field label="Dataset">
        <Select value={datasetId} onChange={(e) => setDatasetId(e.target.value)}>
          <option value="">Escolha…</option>
          {(datasets?.items ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} ({d._count.items})
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex gap-1">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Novo dataset"
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={createDataset}
          disabled={!newName.trim() || !!busy}
        >
          Criar
        </Button>
      </div>
      <Field
        label="Regra padrão ao salvar (regex proibida na resposta)"
        hint="Vazio = sem regra. Em SDR, R\\$ garante que preço nunca aparece."
      >
        <Input value={mustNotMatch} onChange={(e) => setMustNotMatch(e.target.value)} />
      </Field>
      <div className="grid grid-cols-1 gap-1">
        <Button
          size="sm"
          variant="secondary"
          onClick={saveCase}
          disabled={!datasetId || !conversationId || !!busy}
        >
          {busy === 'save' ? 'Salvando…' : 'Salvar conversa atual como caso'}
        </Button>
        <Button size="sm" variant="secondary" onClick={runDataset} disabled={!datasetId || !!busy}>
          {busy === 'run' ? 'Rodando…' : 'Rodar com a configuração A'}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={compareDataset}
          disabled={!datasetId || !!busy}
        >
          {busy === 'runab' ? 'Rodando A e B…' : 'Rodar A × B no dataset'}
        </Button>
      </div>

      <Dialog open={!!compare} onClose={() => setCompare(null)} title="Comparação A × B">
        {compare && (
          <div className="grid gap-3 md:grid-cols-2">
            {(['a', 'b'] as const).map((k) => {
              const s = compare[k]
              return (
                <div key={k} className="rounded-lg border p-3 text-sm">
                  <div className="mb-1 flex flex-wrap items-center gap-1">
                    <span className="font-semibold">{k.toUpperCase()}</span>
                    <Badge
                      tone={
                        s.decision === 'reply'
                          ? 'green'
                          : s.decision === 'handoff'
                            ? 'amber'
                            : 'red'
                      }
                    >
                      {DECISION_LABELS[s.decision] ?? s.decision}
                    </Badge>
                    {s.intent && <Badge tone="brand">{INTENT_LABELS[s.intent] ?? s.intent}</Badge>}
                    <Badge tone="slate">{s.latencyMs} ms</Badge>
                    <Badge tone="slate">${s.costUsd.toFixed(4)}</Badge>
                    {s.validation && (
                      <Badge tone={s.validation.ok ? 'green' : 'red'}>
                        {s.validation.ok
                          ? 'validação ok'
                          : `${s.validation.issues.length} problema(s)`}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted">{s.model ?? 'modelo padrão'}</p>
                  <p className="mt-2 whitespace-pre-wrap">
                    {s.reply ?? `(sem resposta — ${s.decisionReason ?? s.decision})`}
                  </p>
                </div>
              )
            })}
            <p
              className={cn(
                'md:col-span-2 text-xs',
                compare.same ? 'text-muted' : 'text-brand-700',
              )}
            >
              {compare.same ? 'As duas configurações responderam igual.' : 'As respostas diferem.'}
            </p>
          </div>
        )}
      </Dialog>

      <Dialog open={!!runs} onClose={() => setRuns(null)} title="Resultado do dataset">
        {runs && (
          <div className="space-y-3 text-sm">
            <div className={cn('grid gap-3', runs.b ? 'md:grid-cols-2' : '')}>
              {[runs.a, runs.b]
                .filter((x): x is RunSummary => !!x)
                .map((s, i) => (
                  <div
                    key={i}
                    className={cn(
                      'rounded-lg border p-3',
                      runs.winner && runs.winner === (i === 0 ? 'A' : 'B') && 'border-green-400',
                    )}
                  >
                    <p className="font-semibold">
                      {i === 0 ? 'A' : 'B'}{' '}
                      <span className="text-xs font-normal text-muted">
                        {s.config.model ?? 'modelo padrão'} · prompt v
                        {s.config.promptVersion ?? 'atual'}
                      </span>
                    </p>
                    <p className="mt-1 text-2xl font-semibold">{Math.round(s.passRate * 100)}%</p>
                    <p className="text-xs text-muted">
                      {s.passed}/{s.items} aprovados · {Math.round(s.avgLatencyMs)} ms · $
                      {s.totalCostUsd.toFixed(4)} · {s.blocked} bloqueadas · {s.handoffs} handoffs
                    </p>
                  </div>
                ))}
            </div>
            {runs.winner && (
              <p className="text-xs text-muted">
                {runs.winner === 'tie'
                  ? 'Empate na taxa de acerto.'
                  : `Configuração ${runs.winner} teve mais casos aprovados.`}
              </p>
            )}
            <table className="w-full text-xs">
              <thead className="text-left text-muted">
                <tr>
                  <th className="py-1 font-medium">Caso</th>
                  <th className="py-1 font-medium">A</th>
                  {runs.b && <th className="py-1 font-medium">B</th>}
                </tr>
              </thead>
              <tbody>
                {runs.a.results.map((r, i) => {
                  const b = runs.b?.results[i]
                  const cell = (x: ItemResult) => (
                    <td className="py-1 align-top">
                      <Badge tone={x.passed ? 'green' : 'red'}>{x.passed ? 'ok' : 'falhou'}</Badge>
                      <span className="ml-1 text-muted">
                        {DECISION_LABELS[x.decision] ?? x.decision}
                      </span>
                      {!x.passed && <p className="text-red-700">{x.failures.join('; ')}</p>}
                      <p className="mt-0.5 line-clamp-3 text-slate-600">{x.reply ?? '—'}</p>
                    </td>
                  )
                  return (
                    <tr key={r.itemId} className="border-t align-top">
                      <td className="py-1 pr-2 align-top">{r.text}</td>
                      {cell(r)}
                      {b && cell(b)}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Dialog>
    </div>
  )
}
