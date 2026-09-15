'use client'

import { useEffect, useMemo, useState } from 'react'
import { mutate } from 'swr'
import { CheckCircle2, Circle, ExternalLink } from 'lucide-react'
import { api, useApi } from '@/lib/api'
import { useSession } from '@/lib/session'
import { fmtDate } from '@/lib/utils'
import { Badge, Button, Card, Field, Input, Textarea, useToast } from '@/components/ui/primitives'

interface FieldDef {
  key: string
  label: string
  secret?: boolean
  required?: boolean
  placeholder?: string
  help?: string
  multiline?: boolean
}
interface KindDef {
  kind: string
  label: string
  group: 'ia' | 'canal' | 'agenda' | 'infra'
  scope: 'tenant' | 'unit'
  description: string
  docsUrl?: string
  fields: FieldDef[]
}
interface Item {
  id: string
  kind: string
  unitId: string | null
  status: string
  lastError: string | null
  lastSyncAt: string | null
  updatedAt: string
  config: Record<string, string>
  secrets: Record<string, { set: boolean; hint: string | null }>
}
interface SetupItem {
  key: string
  label: string
  required: boolean
  ok: boolean
  detail: string
  tab: string
}

const GROUPS: Array<{ key: KindDef['group']; label: string }> = [
  { key: 'canal', label: 'Canais' },
  { key: 'ia', label: 'Inteligência artificial' },
  { key: 'agenda', label: 'Agenda' },
  { key: 'infra', label: 'Infraestrutura' },
]

const STATUS_TONE: Record<string, 'green' | 'amber' | 'red' | 'slate'> = {
  connected: 'green',
  configured: 'amber',
  error: 'red',
  disconnected: 'slate',
}
const STATUS_LABEL: Record<string, string> = {
  connected: 'conectado',
  configured: 'salvo, não testado',
  error: 'erro',
  disconnected: 'não configurado',
}

export function IntegrationsTab({ onGoTo }: { onGoTo?: (tab: string) => void }) {
  const { unitId } = useSession()
  const key = unitId ? `integrations?unitId=${unitId}` : 'integrations'
  const { data } = useApi<{
    kinds: KindDef[]
    items: Item[]
    runtime: Record<string, string | string[]>
  }>(key)
  const setupKey = unitId ? `setup-status?unitId=${unitId}` : null
  const { data: setup } = useApi<{ salesMode: string; items: SetupItem[]; ready: boolean }>(
    setupKey,
  )
  const { data: templates } = useApi<{
    items: Array<{
      name: string
      language: string
      category: string
      status: string
      lastSyncAt: string | null
    }>
  }>('templates')
  const toast = useToast()
  const rt = data?.runtime ?? {}
  const refresh = async () => {
    await mutate(key)
    if (setupKey) await mutate(setupKey)
  }

  return (
    <div className="space-y-4">
      {setup && (
        <Card
          title={
            setup.ready ? 'Checklist de ativação: pronto para o piloto' : 'Checklist de ativação'
          }
        >
          <ul className="space-y-1.5 text-sm">
            {setup.items.map((i) => (
              <li key={i.key} className="flex items-start gap-2">
                {i.ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <Circle
                    className={`mt-0.5 h-4 w-4 shrink-0 ${i.required ? 'text-red-500' : 'text-slate-300'}`}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    className="text-left hover:underline"
                    onClick={() => onGoTo?.(i.tab)}
                  >
                    {i.label}
                  </button>
                  <span className="ml-2 text-xs text-muted">
                    {i.detail}
                    {!i.required && !i.ok ? ' · opcional' : ''}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Providers em uso para esta conta">
        <div className="grid gap-2 md:grid-cols-3">
          {['llm', 'embedding', 'messaging', 'stt', 'calendar', 'storage', 'trace', 'email'].map(
            (k) => (
              <div
                key={k}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <span className="text-muted">{k}</span>
                <Badge
                  tone={
                    ['mock', 'hash', 'internal', 'local', 'console', 'noop'].includes(String(rt[k]))
                      ? 'amber'
                      : 'green'
                  }
                >
                  {String(rt[k] ?? '—')}
                </Badge>
              </div>
            ),
          )}
        </div>
        <p className="mt-2 text-xs text-muted">
          Credenciais salvas aqui valem para esta conta e substituem as do servidor (.env). Segredos
          são criptografados e nunca são exibidos de volta.
        </p>
      </Card>

      {GROUPS.map((g) => {
        const kinds = (data?.kinds ?? []).filter((k) => k.group === g.key)
        if (!kinds.length) return null
        return (
          <div key={g.key} className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-700">{g.label}</h2>
            {kinds.map((k) => (
              <IntegrationCard
                key={k.kind}
                def={k}
                item={(data?.items ?? []).find(
                  (i) => i.kind === k.kind && (k.scope === 'tenant' || i.unitId === unitId),
                )}
                unitId={unitId}
                onChanged={refresh}
                toast={toast}
              />
            ))}
          </div>
        )
      })}

      <Card
        title="Templates WhatsApp"
        actions={
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              try {
                const r = await api.post<{ synced: number; provider: string }>('templates/sync')
                await mutate('templates')
                toast.show(`${r.synced} templates sincronizados (${r.provider})`)
              } catch (e) {
                toast.show((e as Error).message, 'err')
              }
            }}
          >
            Sincronizar com a Meta
          </Button>
        }
      >
        {templates?.items.length ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th>Nome</th>
                <th>Idioma</th>
                <th>Categoria</th>
                <th>Status</th>
                <th>Sync</th>
              </tr>
            </thead>
            <tbody>
              {templates.items.map((t) => (
                <tr key={`${t.name}-${t.language}`} className="border-t">
                  <td className="py-1">{t.name}</td>
                  <td>{t.language}</td>
                  <td>{t.category}</td>
                  <td>
                    <Badge tone={t.status === 'APPROVED' ? 'green' : 'amber'}>{t.status}</Badge>
                  </td>
                  <td className="text-xs text-muted">
                    {t.lastSyncAt ? fmtDate(t.lastSyncAt) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-xs text-muted">
            Nenhum template. Após conectar o WhatsApp, sincronize para usar templates em follow-ups
            fora da janela de 24h.
          </p>
        )}
      </Card>
      {toast.node}
    </div>
  )
}

function IntegrationCard({
  def,
  item,
  unitId,
  onChanged,
  toast,
}: {
  def: KindDef
  item?: Item
  unitId: string | null
  onChanged: () => Promise<void>
  toast: ReturnType<typeof useToast>
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<'save' | 'test' | 'remove' | null>(null)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  useEffect(() => {
    setValues(item?.config ?? {})
    setTestResult(null)
  }, [item?.id, item?.updatedAt, item?.config])
  const dirty = useMemo(
    () => def.fields.some((f) => (values[f.key] ?? '') !== (item?.config[f.key] ?? '')),
    [values, item, def.fields],
  )
  const scopeUnit = def.scope === 'unit' ? unitId : undefined
  const status = item?.status ?? 'disconnected'

  const run = async (what: 'save' | 'test' | 'remove') => {
    setBusy(what)
    try {
      if (what === 'save') {
        await api.put(`integrations/${def.kind}`, { unitId: scopeUnit ?? undefined, values })
        toast.show(`${def.label}: salvo`)
      } else if (what === 'test') {
        const r = await api.post<{ ok: boolean; message: string }>(
          `integrations/${def.kind}/test`,
          { unitId: scopeUnit ?? undefined },
        )
        setTestResult(r)
        toast.show(r.message, r.ok ? 'ok' : 'err')
      } else {
        if (!confirm(`Remover as credenciais de ${def.label}?`)) return
        await api.del(`integrations/${def.kind}${scopeUnit ? `?unitId=${scopeUnit}` : ''}`)
        setValues({})
        toast.show(`${def.label}: removido`)
      }
      await onChanged()
    } catch (e) {
      toast.show((e as Error).message, 'err')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          {def.label}
          <Badge tone={STATUS_TONE[status] ?? 'slate'}>{STATUS_LABEL[status] ?? status}</Badge>
          {def.scope === 'unit' && <Badge tone="slate">por unidade</Badge>}
        </span>
      }
      actions={
        def.docsUrl ? (
          <a
            href={def.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs text-brand-600 hover:underline"
          >
            onde obter <ExternalLink className="h-3 w-3" />
          </a>
        ) : undefined
      }
    >
      <p className="mb-3 text-xs text-muted">{def.description}</p>
      {def.scope === 'unit' && !unitId && (
        <p className="mb-2 text-xs text-amber-700">
          Selecione uma unidade no topo para configurar.
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {def.fields.map((f) => {
          const secret = item?.secrets[f.key]
          const placeholder = f.secret
            ? secret?.set
              ? `${secret.hint} (deixe em branco para manter)`
              : (f.placeholder ?? '')
            : (f.placeholder ?? '')
          return (
            <div key={f.key} className={f.multiline ? 'md:col-span-2' : ''}>
              <Field label={`${f.label}${f.required ? ' *' : ''}`} hint={f.help}>
                {f.multiline ? (
                  <Textarea
                    rows={4}
                    value={values[f.key] ?? ''}
                    placeholder={placeholder}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  />
                ) : (
                  <Input
                    type={f.secret ? 'password' : 'text'}
                    autoComplete="off"
                    value={values[f.key] ?? ''}
                    placeholder={placeholder}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  />
                )}
              </Field>
            </div>
          )
        })}
      </div>
      {item?.lastError && status === 'error' && (
        <p className="mt-2 rounded-md bg-red-50 p-2 text-xs text-red-700">{item.lastError}</p>
      )}
      {testResult && (
        <p
          className={`mt-2 rounded-md p-2 text-xs ${testResult.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}
        >
          {testResult.message}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => run('save')}
          disabled={busy !== null || (def.scope === 'unit' && !unitId)}
        >
          {busy === 'save' ? 'Salvando…' : 'Salvar'}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => run('test')}
          disabled={busy !== null || !item || dirty}
          title={dirty ? 'Salve antes de testar' : undefined}
        >
          {busy === 'test' ? 'Testando…' : 'Testar conexão'}
        </Button>
        {item && (
          <Button size="sm" variant="ghost" onClick={() => run('remove')} disabled={busy !== null}>
            Remover
          </Button>
        )}
        {item?.lastSyncAt && (
          <span className="text-xs text-muted">último teste OK: {fmtDate(item.lastSyncAt)}</span>
        )}
      </div>
    </Card>
  )
}
