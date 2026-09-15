'use client'

import { useEffect, useState } from 'react'
import { mutate } from 'swr'
import { api, useApi } from '@/lib/api'
import { useSession } from '@/lib/session'
import { fmtDate } from '@/lib/utils'
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Tabs,
  Textarea,
  useToast,
} from '@/components/ui/primitives'

interface Version {
  id: string
  version: number
  status: string
  content: string
  notes: string | null
  createdAt: string
  publishedAt: string | null
  author: { name: string } | null
}
interface Prompt {
  id: string
  key: string
  description: string | null
  tenantId: string | null
  versions: Version[]
}
interface Brain {
  methodology: string
  toneGuidelines: string[]
  discoveryQuestions: string[]
  buyingTriggers: string[]
  objections: Array<{
    key: string
    triggers: string[]
    strategy: string
    responseHints: string[]
    nextStep?: string
  }>
  signals: Array<{
    key: string
    examples: string[]
    meaning: string
    factKey?: string
    factValue?: string
    recommendedProducts: string[]
  }>
  personas: Array<{
    key: string
    name: string
    description: string
    typicalPains: string[]
    recommendedProducts: string[]
    discoveryQuestions: string[]
  }>
  proofPoints: string[]
  stories: string[]
  competitors: Array<{ name: string; positioning: string }>
  commercialRules: string[]
  discountRules: string[]
  nextBestStepRules: string[]
  qualificationCriteria: string[]
  handoffRules: Array<{ key: string; description: string; enabled: boolean }>
  forbidden: string[]
}

const STATUS_TONE: Record<string, 'green' | 'blue' | 'slate' | 'red'> = {
  production: 'green',
  staging: 'blue',
  draft: 'slate',
  archived: 'red',
}

export default function PromptsPage() {
  const [tab, setTab] = useState('prompts')
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold">Agente</h1>
        <p className="text-xs text-muted">
          Prompts versionados (rascunho → staging → produção → rollback) e o Cérebro Comercial
          editável. Nada muda em produção sem publicação humana.
        </p>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'prompts', label: 'Prompts' },
          { key: 'brain', label: 'Cérebro comercial' },
        ]}
      />
      {tab === 'prompts' ? <PromptsTab /> : <BrainTab />}
    </div>
  )
}

function PromptsTab() {
  const { data } = useApi<{ items: Prompt[] }>('prompts')
  const { unitId, can } = useSession()
  const toast = useToast()
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [notes, setNotes] = useState('')
  const prompt = data?.items.find((p) => p.key === selected) ?? data?.items[0]
  const production = prompt?.versions.find((v) => v.status === 'production')
  useEffect(() => {
    if (prompt && !draft) setDraft(production?.content ?? prompt.versions[0]?.content ?? '')
  }, [prompt, production, draft])
  const refresh = () => mutate('prompts')

  return (
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      <Card>
        <ul className="space-y-1">
          {(data?.items ?? []).map((p) => (
            <li key={p.key}>
              <button
                type="button"
                onClick={() => {
                  setSelected(p.key)
                  setDraft('')
                }}
                className={`w-full rounded-md px-2 py-1.5 text-left text-sm ${prompt?.key === p.key ? 'bg-brand-50 text-brand-700' : 'hover:bg-slate-100'}`}
              >
                <p className="font-medium">{p.key}</p>
                <p className="text-[11px] text-muted">
                  {p.tenantId ? 'personalizado' : 'padrão da plataforma'} · v
                  {p.versions.find((v) => v.status === 'production')?.version ?? '-'} em produção
                </p>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      {prompt && (
        <div className="space-y-4">
          <Card
            title={`${prompt.key} — nova versão`}
            actions={<span className="text-xs text-muted">{prompt.description}</span>}
          >
            <Textarea
              rows={16}
              className="font-mono text-xs"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="mt-2 flex items-center gap-2">
              <Input
                placeholder="Notas da versão"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <Button
                disabled={!can('admin') || draft.length < 10}
                onClick={async () => {
                  try {
                    await api.post(`prompts/${prompt.key}/versions`, {
                      content: draft,
                      notes: notes || undefined,
                    })
                    setNotes('')
                    await refresh()
                    toast.show(
                      'Rascunho criado. Teste no Playground (env=staging) antes de publicar.',
                    )
                  } catch (e) {
                    toast.show((e as Error).message, 'err')
                  }
                }}
              >
                Salvar rascunho
              </Button>
              <Button
                variant="secondary"
                disabled={!can('admin')}
                title="Analisa respostas bloqueadas, avaliações negativas e handoffs recentes e cria um rascunho revisado"
                onClick={async () => {
                  const focus = window.prompt(
                    'Foco da melhoria (opcional). Ex.: "convidar para a visita mais cedo"',
                    '',
                  )
                  if (focus === null) return
                  try {
                    const r = await api.post<{ analysis: string; changes: string[] }>(
                      `prompts/${prompt.key}/suggest`,
                      { unitId, focus: focus || undefined },
                    )
                    await refresh()
                    toast.show(`Rascunho sugerido: ${r.analysis}`)
                  } catch (e) {
                    toast.show((e as Error).message, 'err')
                  }
                }}
              >
                Sugerir melhoria (IA)
              </Button>
            </div>
            <p className="mt-1 text-[11px] text-muted">
              Variáveis disponíveis:{' '}
              {'{{agent_name}}, {{catalog_summary}}, {{facts}}, {{knowledge}}, {{sales_brain}}…'} —
              veja a versão em produção.
            </p>
          </Card>
          <Card title="Versões">
            <table className="w-full text-sm">
              <tbody>
                {prompt.versions.map((v) => (
                  <tr key={v.id} className="border-b last:border-0">
                    <td className="py-2 font-medium">v{v.version}</td>
                    <td>
                      <Badge tone={STATUS_TONE[v.status] ?? 'slate'}>{v.status}</Badge>
                    </td>
                    <td className="text-xs text-muted">{v.notes ?? '—'}</td>
                    <td className="text-xs text-muted">
                      {v.author?.name ?? 'plataforma'} · {fmtDate(v.createdAt)}
                    </td>
                    <td className="text-right text-xs">
                      <span className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="text-brand-700 hover:underline"
                          onClick={() => setDraft(v.content)}
                        >
                          carregar
                        </button>
                        {can('admin') && prompt.tenantId && v.status !== 'production' && (
                          <button
                            type="button"
                            className="text-emerald-700 hover:underline"
                            onClick={async () => {
                              await api.post(`prompts/versions/${v.id}/status`, {
                                status: 'production',
                              })
                              await refresh()
                              toast.show(`v${v.version} em produção`)
                            }}
                          >
                            {v.status === 'archived' ? 'rollback' : 'publicar'}
                          </button>
                        )}
                        {can('admin') && prompt.tenantId && v.status === 'draft' && (
                          <button
                            type="button"
                            className="text-sky-700 hover:underline"
                            onClick={async () => {
                              await api.post(`prompts/versions/${v.id}/status`, {
                                status: 'staging',
                              })
                              await refresh()
                            }}
                          >
                            staging
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!prompt.tenantId && (
              <p className="mt-2 text-[11px] text-muted">
                Este é o prompt padrão da plataforma. Ao salvar um rascunho, uma cópia personalizada
                do tenant é criada e passa a prevalecer quando publicada.
              </p>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}

function BrainTab() {
  const { unitId, can } = useSession()
  const key = unitId ? `sales-brain?unitId=${unitId}` : null
  const { data } = useApi<{
    brain: Brain
    version: number
    versions: Array<{
      id: string
      version: number
      status: string
      changelog: string | null
      createdAt: string
    }>
  }>(key)
  const [brain, setBrain] = useState<Brain | null>(null)
  const [changelog, setChangelog] = useState('')
  const toast = useToast()
  useEffect(() => {
    if (data && !brain) setBrain(data.brain)
  }, [data, brain])
  if (!brain) return <p className="text-sm text-muted">Carregando…</p>
  const lines = (arr: string[]) => arr.join('\n')
  const parse = (v: string) =>
    v
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  const L = (label: string, field: keyof Brain, rows = 4) => (
    <Field label={label}>
      <Textarea
        rows={rows}
        value={lines(brain[field] as string[])}
        onChange={(e) => setBrain({ ...brain, [field]: parse(e.target.value) })}
      />
    </Field>
  )
  return (
    <div className="space-y-4">
      <Card title={`Cérebro comercial — versão ${data?.version ?? 0} em produção`}>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Field label="Metodologia">
              <Textarea
                rows={3}
                value={brain.methodology}
                onChange={(e) => setBrain({ ...brain, methodology: e.target.value })}
              />
            </Field>
          </div>
          {L('Diretrizes de tom (uma por linha)', 'toneGuidelines')}
          {L('Perguntas de descoberta', 'discoveryQuestions')}
          {L('Gatilhos de compra', 'buyingTriggers')}
          {L('Provas', 'proofPoints')}
          {L('Histórias', 'stories')}
          {L('Regras comerciais', 'commercialRules')}
          {L('Regras de desconto', 'discountRules')}
          {L('Regras de próximo passo', 'nextBestStepRules')}
          {L('Critérios de qualificação', 'qualificationCriteria')}
          {L('Proibido', 'forbidden')}
        </div>
      </Card>
      <Card title="Objeções">
        <div className="space-y-2">
          {brain.objections.map((o, i) => (
            <div
              key={i}
              className="grid gap-2 rounded-md border p-2 md:grid-cols-[120px_1fr_1fr_auto]"
            >
              <Input
                value={o.key}
                onChange={(e) =>
                  setBrain({
                    ...brain,
                    objections: brain.objections.map((x, j) =>
                      j === i ? { ...x, key: e.target.value } : x,
                    ),
                  })
                }
                placeholder="chave"
              />
              <Textarea
                rows={2}
                value={o.strategy}
                onChange={(e) =>
                  setBrain({
                    ...brain,
                    objections: brain.objections.map((x, j) =>
                      j === i ? { ...x, strategy: e.target.value } : x,
                    ),
                  })
                }
                placeholder="estratégia"
              />
              <Textarea
                rows={2}
                value={o.responseHints.join('\n')}
                onChange={(e) =>
                  setBrain({
                    ...brain,
                    objections: brain.objections.map((x, j) =>
                      j === i ? { ...x, responseHints: parse(e.target.value) } : x,
                    ),
                  })
                }
                placeholder="exemplos de resposta"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setBrain({ ...brain, objections: brain.objections.filter((_, j) => j !== i) })
                }
              >
                remover
              </Button>
            </div>
          ))}
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              setBrain({
                ...brain,
                objections: [
                  ...brain.objections,
                  { key: '', triggers: [], strategy: '', responseHints: [] },
                ],
              })
            }
          >
            + objeção
          </Button>
        </div>
      </Card>
      <Card title="Sinais comerciais → fatos e produtos">
        <div className="space-y-2">
          {brain.signals.map((s, i) => (
            <div
              key={i}
              className="grid gap-2 rounded-md border p-2 md:grid-cols-[120px_1fr_120px_140px_140px_auto]"
            >
              <Input
                value={s.key}
                placeholder="chave"
                onChange={(e) =>
                  setBrain({
                    ...brain,
                    signals: brain.signals.map((x, j) =>
                      j === i ? { ...x, key: e.target.value } : x,
                    ),
                  })
                }
              />
              <Input
                value={s.meaning}
                placeholder="significado / como conduzir"
                onChange={(e) =>
                  setBrain({
                    ...brain,
                    signals: brain.signals.map((x, j) =>
                      j === i ? { ...x, meaning: e.target.value } : x,
                    ),
                  })
                }
              />
              <Input
                value={s.factKey ?? ''}
                placeholder="fato (key)"
                onChange={(e) =>
                  setBrain({
                    ...brain,
                    signals: brain.signals.map((x, j) =>
                      j === i ? { ...x, factKey: e.target.value || undefined } : x,
                    ),
                  })
                }
              />
              <Input
                value={s.factValue ?? ''}
                placeholder="valor"
                onChange={(e) =>
                  setBrain({
                    ...brain,
                    signals: brain.signals.map((x, j) =>
                      j === i ? { ...x, factValue: e.target.value || undefined } : x,
                    ),
                  })
                }
              />
              <Input
                value={s.recommendedProducts.join(',')}
                placeholder="produtos (slugs)"
                onChange={(e) =>
                  setBrain({
                    ...brain,
                    signals: brain.signals.map((x, j) =>
                      j === i
                        ? {
                            ...x,
                            recommendedProducts: e.target.value
                              .split(',')
                              .map((v) => v.trim())
                              .filter(Boolean),
                          }
                        : x,
                    ),
                  })
                }
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setBrain({ ...brain, signals: brain.signals.filter((_, j) => j !== i) })
                }
              >
                remover
              </Button>
            </div>
          ))}
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              setBrain({
                ...brain,
                signals: [
                  ...brain.signals,
                  { key: '', examples: [], meaning: '', recommendedProducts: [] },
                ],
              })
            }
          >
            + sinal
          </Button>
        </div>
      </Card>
      <div className="flex items-center gap-2">
        <Input
          placeholder="Changelog"
          value={changelog}
          onChange={(e) => setChangelog(e.target.value)}
        />
        <Button
          variant="secondary"
          disabled={!can('admin')}
          onClick={async () => {
            try {
              await api.post('sales-brain/versions', {
                unitId,
                content: brain,
                changelog: changelog || undefined,
              })
              await mutate(key)
              toast.show('Rascunho salvo')
            } catch (e) {
              toast.show((e as Error).message, 'err')
            }
          }}
        >
          Salvar rascunho
        </Button>
        <Button
          disabled={!can('admin')}
          onClick={async () => {
            try {
              const v = await api.post<{ id: string }>('sales-brain/versions', {
                unitId,
                content: brain,
                changelog: changelog || 'publicação',
              })
              await api.post(`sales-brain/versions/${v.id}/publish`)
              await mutate(key)
              toast.show('Publicado em produção')
            } catch (e) {
              toast.show((e as Error).message, 'err')
            }
          }}
        >
          Salvar e publicar
        </Button>
      </div>
      <Card title="Histórico">
        <ul className="text-xs">
          {(data?.versions ?? []).map((v) => (
            <li key={v.id} className="flex items-center gap-2 border-b py-1 last:border-0">
              <span className="font-medium">v{v.version}</span>{' '}
              <Badge tone={STATUS_TONE[v.status] ?? 'slate'}>{v.status}</Badge>{' '}
              <span className="text-muted">
                {v.changelog ?? ''} · {fmtDate(v.createdAt)}
              </span>
              {can('admin') && v.status !== 'production' && (
                <button
                  type="button"
                  className="ml-auto text-emerald-700 hover:underline"
                  onClick={async () => {
                    await api.post(`sales-brain/versions/${v.id}/publish`)
                    await mutate(key)
                    setBrain(null)
                  }}
                >
                  publicar
                </button>
              )}
            </li>
          ))}
        </ul>
      </Card>
      {toast.node}
    </div>
  )
}
