'use client'

import { useState } from 'react'
import { mutate } from 'swr'
import { api, useApi } from '@/lib/api'
import { useSession } from '@/lib/session'
import { fmtDate } from '@/lib/utils'
import {
  Badge,
  Button,
  Card,
  Dialog,
  Field,
  Input,
  Select,
  Tabs,
  Textarea,
  Toggle,
  useToast,
} from '@/components/ui/primitives'

interface Doc {
  id: string
  title: string
  category: string
  status: string
  priority: number
  version: number
  unitId: string | null
  chunkCount: number
  ingestStatus: string
  ingestError: string | null
  sourceType: string
  updatedAt: string
  validTo: string | null
  product: { name: string } | null
  unit: { name: string } | null
}
interface Hit {
  chunkId: string
  title: string
  category: string
  score: number
  content: string
  version: number
}

const STATUS_TONE: Record<string, 'green' | 'slate' | 'amber' | 'red'> = {
  published: 'green',
  draft: 'slate',
  expired: 'amber',
  archived: 'red',
}

export default function KnowledgePage() {
  const { unitId, can } = useSession()
  const key = unitId ? `knowledge/documents?unitId=${unitId}` : null
  const { data } = useApi<{ items: Doc[] }>(key, { refreshInterval: 10000 })
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('text')
  const [detail, setDetail] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Hit[] | null>(null)
  const refresh = () => mutate(key)

  async function setStatus(id: string, status: string) {
    await api.post(`knowledge/documents/${id}/status`, { status })
    await refresh()
    toast.show(`Documento ${status === 'published' ? 'publicado' : status}`)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Base de conhecimento</h1>
          <p className="text-xs text-muted">
            Só documentos <b>publicados</b> e vigentes entram nas respostas. Publicar uma nova
            versão não exige reiniciar nada.
          </p>
        </div>
        {can('manager') && <Button onClick={() => setOpen(true)}>Novo documento</Button>}
      </div>

      <Card title="Testar busca híbrida (BM25 + vetor)">
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!query.trim()) return
            const r = await api.post<{ hits: Hit[] }>('knowledge/search', {
              unitId,
              query,
              limit: 5,
            })
            setHits(r.hits)
          }}
        >
          <Input
            placeholder="Ex.: posso repor aula se faltar?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
        </form>
        {hits && (
          <div className="mt-3 space-y-2">
            {hits.length ? (
              hits.map((h) => (
                <details key={h.chunkId} className="rounded-md border p-2 text-xs">
                  <summary className="cursor-pointer">
                    <span className="font-medium">{h.title}</span>{' '}
                    <span className="text-muted">
                      v{h.version} · {h.category} · score {h.score.toFixed(3)}
                    </span>
                  </summary>
                  <p className="mt-1 whitespace-pre-wrap text-slate-600">{h.content}</p>
                </details>
              ))
            ) : (
              <p className="text-xs text-muted">Nenhum trecho encontrado.</p>
            )}
          </div>
        )}
      </Card>

      <Card>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="pb-2">Título</th>
              <th>Categoria</th>
              <th>Escopo</th>
              <th>Status</th>
              <th>Indexação</th>
              <th>Prior.</th>
              <th>Atualizado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((d) => (
              <tr key={d.id} className="border-t">
                <td className="py-2">
                  <button
                    type="button"
                    className="font-medium hover:underline"
                    onClick={() => setDetail(d.id)}
                  >
                    {d.title}
                  </button>{' '}
                  <span className="text-[10px] text-muted">
                    v{d.version} · {d.sourceType}
                  </span>
                </td>
                <td>{d.category}</td>
                <td>
                  {d.unit?.name ?? <Badge tone="blue">global</Badge>}
                  {d.product && ` · ${d.product.name}`}
                </td>
                <td>
                  <Badge tone={STATUS_TONE[d.status] ?? 'slate'}>{d.status}</Badge>
                  {d.validTo && (
                    <span className="ml-1 text-[10px] text-muted">
                      até {d.validTo.slice(0, 10)}
                    </span>
                  )}
                </td>
                <td>
                  {d.ingestStatus === 'ready' ? (
                    <span className="text-xs text-emerald-700">{d.chunkCount} trechos</span>
                  ) : (
                    <span className="text-xs text-amber-700" title={d.ingestError ?? ''}>
                      {d.ingestStatus}
                    </span>
                  )}
                </td>
                <td>{d.priority}</td>
                <td className="text-xs text-muted">{fmtDate(d.updatedAt)}</td>
                <td className="text-right text-xs">
                  {can('manager') && (
                    <span className="flex justify-end gap-2">
                      {d.status !== 'published' && (
                        <button
                          type="button"
                          className="text-emerald-700 hover:underline"
                          onClick={() => setStatus(d.id, 'published')}
                        >
                          publicar
                        </button>
                      )}
                      {d.status === 'published' && (
                        <button
                          type="button"
                          className="text-slate-600 hover:underline"
                          onClick={() => setStatus(d.id, 'archived')}
                        >
                          arquivar
                        </button>
                      )}
                      <button
                        type="button"
                        className="text-brand-700 hover:underline"
                        onClick={async () => {
                          await api.post(`knowledge/documents/${d.id}/reingest`, { inline: true })
                          await refresh()
                          toast.show('Reindexado')
                        }}
                      >
                        reindexar
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {!data?.items.length && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-xs text-muted">
                  Nenhum documento.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} title="Novo documento" wide>
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'text', label: 'Texto' },
            { key: 'url', label: 'URL' },
            { key: 'upload', label: 'Upload (PDF, DOCX, XLSX, CSV, TXT)' },
          ]}
        />
        <NewDocForm
          mode={tab as 'text' | 'url' | 'upload'}
          unitId={unitId}
          onDone={async () => {
            await refresh()
            setOpen(false)
            toast.show('Documento criado e indexado')
          }}
          onError={(m) => toast.show(m, 'err')}
        />
      </Dialog>
      {detail && <DocDetail id={detail} onClose={() => setDetail(null)} />}
      {toast.node}
    </div>
  )
}

function NewDocForm({
  mode,
  unitId,
  onDone,
  onError,
}: {
  mode: 'text' | 'url' | 'upload'
  unitId: string
  onDone: () => void
  onError: (m: string) => void
}) {
  const [global, setGlobal] = useState(false)
  const [publish, setPublish] = useState(true)
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="mt-3 grid gap-3 md:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        const f = new FormData(e.currentTarget)
        try {
          if (mode === 'upload') {
            const fd = new FormData()
            const file = f.get('file') as File
            fd.append('file', file)
            fd.append('title', String(f.get('title') || file.name))
            fd.append('category', String(f.get('category')))
            fd.append('priority', String(f.get('priority')))
            fd.append('publish', String(publish))
            fd.append('inline', 'true')
            if (!global) fd.append('unitId', unitId)
            await api.upload('knowledge/documents/upload', fd)
          } else {
            await api.post('knowledge/documents', {
              title: f.get('title'),
              category: f.get('category'),
              priority: Number(f.get('priority')),
              sourceType: mode,
              content: mode === 'text' ? f.get('content') : undefined,
              url: mode === 'url' ? f.get('url') : undefined,
              unitId: global ? null : unitId,
              publish,
              inline: true,
              validTo: f.get('validTo') ? new Date(String(f.get('validTo'))).toISOString() : null,
            })
          }
          onDone()
        } catch (err) {
          onError((err as Error).message)
        } finally {
          setBusy(false)
        }
      }}
    >
      <Field label="Título">
        <Input name="title" required={mode !== 'upload'} />
      </Field>
      <Field label="Categoria">
        <Select name="category" defaultValue="general">
          <option value="general">Geral</option>
          <option value="product">Produto</option>
          <option value="faq">FAQ</option>
          <option value="script">Script comercial</option>
          <option value="objection">Objeções</option>
          <option value="policy">Política</option>
          <option value="pricing_policy">Política de preços</option>
          <option value="calendar">Calendário</option>
          <option value="marketing">Marketing</option>
          <option value="transcript">Transcrição</option>
        </Select>
      </Field>
      <Field label="Prioridade (1–10)" hint="Tabela oficial da unidade > página genérica">
        <Input name="priority" type="number" min={1} max={10} defaultValue={5} />
      </Field>
      <Field label="Válido até (opcional)">
        <Input name="validTo" type="date" />
      </Field>
      {mode === 'text' && (
        <div className="md:col-span-2">
          <Field label="Conteúdo (Markdown)">
            <Textarea name="content" rows={10} required />
          </Field>
        </div>
      )}
      {mode === 'url' && (
        <div className="md:col-span-2">
          <Field label="URL pública">
            <Input name="url" type="url" required placeholder="https://..." />
          </Field>
        </div>
      )}
      {mode === 'upload' && (
        <div className="md:col-span-2">
          <Field label="Arquivo">
            <input
              name="file"
              type="file"
              required
              accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.md,.html"
              className="text-sm"
            />
          </Field>
        </div>
      )}
      <div className="flex gap-4 md:col-span-2">
        <Toggle checked={!global} onChange={(v) => setGlobal(!v)} label="Somente esta unidade" />
        <Toggle checked={publish} onChange={setPublish} label="Publicar imediatamente" />
      </div>
      <div className="flex justify-end md:col-span-2">
        <Button type="submit" disabled={busy}>
          {busy ? 'Indexando…' : 'Salvar e indexar'}
        </Button>
      </div>
    </form>
  )
}

function DocDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data } = useApi<
    Doc & { chunks: Array<{ id: string; ordinal: number; content: string; tokenCount: number }> }
  >(`knowledge/documents/${id}`)
  return (
    <Dialog open onClose={onClose} title={data?.title ?? 'Documento'} wide>
      {!data ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted">
            {data.chunks.length} trechos · {data.category} · v{data.version} · {data.status}
          </p>
          {data.chunks.map((c) => (
            <div key={c.id} className="rounded-md border p-2 text-xs">
              <p className="mb-1 text-[10px] text-muted">
                #{c.ordinal} · ~{c.tokenCount} tokens · id {c.id.slice(0, 8)}
              </p>
              <p className="whitespace-pre-wrap">{c.content}</p>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  )
}
