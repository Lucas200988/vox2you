'use client'

import { useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import { api } from '@/lib/api'
import { Button, Textarea } from '@/components/ui/primitives'

interface Suggestion {
  suggestedReply: string
  detectedObjection: string | null
  nextBestAction: string
  summary: string
  crmUpdates: Array<{ key: string; value: string }>
  costUsd: number
}

export function CopilotPanel({
  conversationId,
  onUseDraft,
  onClose,
}: {
  conversationId: string
  onUseDraft: (text: string) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [result, setResult] = useState<Suggestion | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(mode: 'suggest' | 'improve' | 'summarize' | 'next_action') {
    setLoading(mode)
    setError(null)
    try {
      setResult(
        await api.post<Suggestion>(`conversations/${conversationId}/copilot`, {
          mode,
          draft: draft || undefined,
        }),
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(null)
    }
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l bg-white">
      <header className="flex items-center justify-between border-b px-3 py-2">
        <p className="inline-flex items-center gap-1 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-brand-600" /> Copilot
        </p>
        <button type="button" onClick={onClose} className="text-muted hover:text-ink">
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="space-y-3 overflow-y-auto p-3 text-sm scroll-thin">
        <p className="text-[11px] text-muted">
          Sugestões nunca são enviadas automaticamente: revise e use no rascunho.
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => run('suggest')} disabled={!!loading}>
            {loading === 'suggest' ? '…' : 'Sugerir resposta'}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => run('next_action')}
            disabled={!!loading}
          >
            {loading === 'next_action' ? '…' : 'Próxima ação'}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => run('summarize')}
            disabled={!!loading}
          >
            {loading === 'summarize' ? '…' : 'Resumir'}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => run('improve')}
            disabled={!!loading || !draft}
          >
            {loading === 'improve' ? '…' : 'Melhorar rascunho'}
          </Button>
        </div>
        <Textarea
          rows={3}
          placeholder="Rascunho para melhorar (opcional)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        {error && <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">{error}</p>}
        {result && (
          <div className="space-y-3">
            <Block label="Resposta sugerida">
              <p className="whitespace-pre-wrap">{result.suggestedReply}</p>
              <Button size="sm" className="mt-2" onClick={() => onUseDraft(result.suggestedReply)}>
                Usar no rascunho
              </Button>
            </Block>
            {result.detectedObjection && (
              <Block label="Objeção identificada">{result.detectedObjection}</Block>
            )}
            <Block label="Próxima melhor ação">{result.nextBestAction}</Block>
            <Block label="Resumo">{result.summary}</Block>
            {result.crmUpdates.length > 0 && (
              <Block label="Sugestões de CRM">
                <ul className="list-disc pl-4">
                  {result.crmUpdates.map((u, i) => (
                    <li key={i}>
                      <span className="text-muted">{u.key}:</span> {u.value}
                    </li>
                  ))}
                </ul>
              </Block>
            )}
            <p className="text-[10px] text-muted">custo ${result.costUsd.toFixed(4)}</p>
          </div>
        )}
      </div>
    </aside>
  )
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-slate-50 p-2.5">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  )
}
