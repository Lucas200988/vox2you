'use client'

import { useState } from 'react'
import { mutate } from 'swr'
import { api, useApi } from '@/lib/api'
import type { Stage } from '@/lib/types'
import { Button, Card, Input, useToast } from '@/components/ui/primitives'

interface Pipeline {
  id: string
  name: string
  unitId: string | null
  isDefault: boolean
  stages: Stage[]
}

/** Funil: SLA por estágio (horas máximas). Leads acima do limite ficam marcados no kanban e o
 * responsável recebe uma notificação (uma por lead por dia). */
export function PipelineTab() {
  const { data } = useApi<{ items: Pipeline[] }>('pipelines')
  const toast = useToast()
  const [saving, setSaving] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})

  const save = async (pipeline: Pipeline, stage: Stage) => {
    const raw = draft[stage.id]
    if (raw === undefined) return
    const value = raw.trim() === '' ? null : Number(raw)
    if (value !== null && (!Number.isInteger(value) || value < 1)) {
      toast.show('Informe um número inteiro de horas (ou deixe vazio para sem SLA)')
      return
    }
    setSaving(stage.id)
    try {
      await api.patch(`pipelines/${pipeline.id}/stages/${stage.id}`, { maxHoursInStage: value })
      await mutate('pipelines')
      setDraft((d) => {
        const { [stage.id]: _omit, ...rest } = d
        return rest
      })
      toast.show('SLA salvo')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Defina quantas horas um lead pode ficar em cada estágio. Acima disso ele aparece com o selo{' '}
        <span className="font-medium text-red-600">SLA</span> no kanban e o responsável (ou os
        gestores da unidade) recebem uma notificação, no máximo uma por lead a cada 24h.
      </p>
      {(data?.items ?? []).map((pipeline) => (
        <Card key={pipeline.id} className="p-4">
          <h3 className="text-sm font-semibold">
            {pipeline.name}
            {pipeline.isDefault && <span className="ml-2 text-xs text-muted">(padrão)</span>}
          </h3>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1 font-medium">Estágio</th>
                <th className="py-1 font-medium">Probabilidade</th>
                <th className="py-1 font-medium">SLA (horas)</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {pipeline.stages.map((stage) => {
                const current = stage.maxHoursInStage ?? ''
                const value = draft[stage.id] ?? String(current)
                const dirty = draft[stage.id] !== undefined && draft[stage.id] !== String(current)
                const closed = stage.kind === 'won' || stage.kind === 'lost'
                return (
                  <tr key={stage.id} className="border-t">
                    <td className="py-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: stage.color ?? '#94a3b8' }}
                        />
                        {stage.name}
                      </span>
                    </td>
                    <td className="py-1.5 text-muted">{Math.round(stage.probability * 100)}%</td>
                    <td className="py-1.5">
                      {closed ? (
                        <span className="text-xs text-muted">—</span>
                      ) : (
                        <Input
                          className="h-8 w-28"
                          inputMode="numeric"
                          placeholder="sem SLA"
                          value={value}
                          onChange={(e) => setDraft((d) => ({ ...d, [stage.id]: e.target.value }))}
                        />
                      )}
                    </td>
                    <td className="py-1.5 text-right">
                      {!closed && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!dirty || saving === stage.id}
                          onClick={() => void save(pipeline, stage)}
                        >
                          {saving === stage.id ? 'Salvando…' : 'Salvar'}
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      ))}
      {data && data.items.length === 0 && (
        <p className="text-sm text-muted">
          Nenhum funil ainda. Ele é criado ao cadastrar a unidade.
        </p>
      )}
    </div>
  )
}
