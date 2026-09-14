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
  Select,
  Tabs,
  Textarea,
  Toggle,
  useToast,
} from '@/components/ui/primitives'

const TABS = [
  { key: 'agent', label: 'Agente' },
  { key: 'score', label: 'Score' },
  { key: 'followup', label: 'Follow-up' },
  { key: 'users', label: 'Usuários' },
  { key: 'integrations', label: 'Integrações' },
  { key: 'automations', label: 'Automações' },
  { key: 'audit', label: 'Auditoria' },
]

export default function SettingsPage() {
  const [tab, setTab] = useState('agent')
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <h1 className="text-lg font-semibold">Configurações</h1>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'agent' && <AgentTab />}
      {tab === 'score' && <ScoreTab />}
      {tab === 'followup' && <FollowUpTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'integrations' && <IntegrationsTab />}
      {tab === 'automations' && <AutomationsTab />}
      {tab === 'audit' && <AuditTab />}
    </div>
  )
}

interface AgentSettings {
  enabled: boolean
  agentName: string
  persona: string | null
  tone: string | null
  models: Record<string, string>
  maxReplyChars: number
  maxQuestionsPerReply: number
  minConfidence: number
  autoStageTransitions: boolean
  handoffRules: Record<string, unknown> & { keywords?: string[] }
  outOfHoursMessage: string | null
  businessHours: Array<{ weekday: number; start: string; end: string }>
}

function AgentTab() {
  const { unitId } = useSession()
  const key = unitId ? `agent-settings?unitId=${unitId}` : null
  const { data } = useApi<{ resolved: AgentSettings; defaults: Record<string, string> }>(key)
  const [s, setS] = useState<AgentSettings | null>(null)
  const toast = useToast()
  useEffect(() => {
    if (data && !s) setS(data.resolved)
  }, [data, s])
  if (!s) return <p className="text-sm text-muted">Carregando…</p>
  const rules = s.handoffRules as Record<string, boolean | number | string[] | null>
  const setRule = (k: string, v: unknown) =>
    setS({ ...s, handoffRules: { ...s.handoffRules, [k]: v } })
  return (
    <div className="space-y-4">
      <Card title="Comportamento">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Toggle
              checked={s.enabled}
              onChange={(v) => setS({ ...s, enabled: v })}
              label="Agente ativo (responde automaticamente novas mensagens)"
            />
          </div>
          <Field label="Nome do agente">
            <Input
              value={s.agentName}
              onChange={(e) => setS({ ...s, agentName: e.target.value })}
            />
          </Field>
          <Field label="Confiança mínima para responder" hint="Abaixo disso, transfere para humano">
            <Input
              type="number"
              step="0.05"
              min={0}
              max={1}
              value={s.minConfidence}
              onChange={(e) => setS({ ...s, minConfidence: Number(e.target.value) })}
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="Persona">
              <Textarea
                rows={2}
                value={s.persona ?? ''}
                onChange={(e) => setS({ ...s, persona: e.target.value })}
              />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Tom">
              <Textarea
                rows={2}
                value={s.tone ?? ''}
                onChange={(e) => setS({ ...s, tone: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Máx. caracteres por resposta">
            <Input
              type="number"
              value={s.maxReplyChars}
              onChange={(e) => setS({ ...s, maxReplyChars: Number(e.target.value) })}
            />
          </Field>
          <Field label="Máx. perguntas por resposta">
            <Input
              type="number"
              value={s.maxQuestionsPerReply}
              onChange={(e) => setS({ ...s, maxQuestionsPerReply: Number(e.target.value) })}
            />
          </Field>
          <div className="md:col-span-2">
            <Toggle
              checked={s.autoStageTransitions}
              onChange={(v) => setS({ ...s, autoStageTransitions: v })}
              label="Mover estágio automaticamente (senão, apenas sugere)"
            />
          </div>
          <div className="md:col-span-2">
            <Field label="Mensagem fora do horário (opcional)">
              <Textarea
                rows={2}
                value={s.outOfHoursMessage ?? ''}
                onChange={(e) => setS({ ...s, outOfHoursMessage: e.target.value || null })}
              />
            </Field>
          </div>
        </div>
      </Card>
      <Card
        title="Modelos por tarefa"
        actions={
          <span className="text-xs text-muted">
            padrões:{' '}
            {Object.values(data?.defaults ?? {})
              .filter((v, i, a) => a.indexOf(v) === i)
              .join(', ')}
          </span>
        }
      >
        <div className="grid gap-3 md:grid-cols-3">
          {Object.entries(s.models).map(([task, model]) => (
            <Field key={task} label={task}>
              <Input
                value={model}
                onChange={(e) => setS({ ...s, models: { ...s.models, [task]: e.target.value } })}
              />
            </Field>
          ))}
        </div>
      </Card>
      <Card title="Regras de handoff para humano">
        <div className="grid gap-2 md:grid-cols-2">
          {[
            ['onHumanRequest', 'Cliente pede atendente'],
            ['onComplaint', 'Reclamação'],
            ['onEmotional', 'Cliente irritado / situação emocional'],
            ['onDiscountRequest', 'Pedido de desconto'],
            ['onB2BComplex', 'B2B complexo'],
            ['onLowConfidence', 'Baixa confiança'],
          ].map(([k, label]) => (
            <Toggle
              key={k}
              checked={Boolean(rules[k!])}
              onChange={(v) => setRule(k!, v)}
              label={label!}
            />
          ))}
          <Field label="Falhas consecutivas antes do handoff">
            <Input
              type="number"
              value={Number(rules['onRepeatedFailures'] ?? 2)}
              onChange={(e) => setRule('onRepeatedFailures', Number(e.target.value))}
            />
          </Field>
          <Field label="Score para acionar humano (0 = desligado)">
            <Input
              type="number"
              value={Number(rules['onHighScore'] ?? 0)}
              onChange={(e) => setRule('onHighScore', Number(e.target.value) || null)}
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="Palavras-chave (uma por linha)">
              <Textarea
                rows={2}
                value={((rules['keywords'] as string[]) ?? []).join('\n')}
                onChange={(e) =>
                  setRule(
                    'keywords',
                    e.target.value
                      .split('\n')
                      .map((x) => x.trim())
                      .filter(Boolean),
                  )
                }
              />
            </Field>
          </div>
        </div>
      </Card>
      <Button
        onClick={async () => {
          try {
            await api.put(`agent-settings?unitId=${unitId}`, {
              enabled: s.enabled,
              agentName: s.agentName,
              persona: s.persona,
              tone: s.tone,
              models: s.models,
              maxReplyChars: s.maxReplyChars,
              maxQuestionsPerReply: s.maxQuestionsPerReply,
              minConfidence: s.minConfidence,
              autoStageTransitions: s.autoStageTransitions,
              handoffRules: s.handoffRules,
              outOfHoursMessage: s.outOfHoursMessage,
              businessHours: { rules: s.businessHours },
            })
            await mutate(key)
            toast.show('Configurações salvas')
          } catch (e) {
            toast.show((e as Error).message, 'err')
          }
        }}
      >
        Salvar
      </Button>
      {toast.node}
    </div>
  )
}

function ScoreTab() {
  const { unitId } = useSession()
  const key = unitId ? `scoring?unitId=${unitId}` : null
  const { data } = useApi<{ weights: Record<string, number>; defaults: Record<string, number> }>(
    key,
  )
  const [w, setW] = useState<Record<string, number> | null>(null)
  const toast = useToast()
  useEffect(() => {
    if (data && !w) setW(data.weights)
  }, [data, w])
  if (!w) return <p className="text-sm text-muted">Carregando…</p>
  return (
    <Card
      title="Pesos do lead score"
      actions={
        <Button size="sm" variant="ghost" onClick={() => setW(data!.defaults)}>
          restaurar padrão
        </Button>
      }
    >
      <p className="mb-3 text-xs text-muted">
        Cada fator contribui com peso × sinal (0–1). O score final é limitado a 0–100 e sempre
        mostra os fatores principais no lead.
      </p>
      <div className="grid gap-2 md:grid-cols-4">
        {Object.entries(w).map(([k, v]) => (
          <Field key={k} label={k}>
            <Input
              type="number"
              value={v}
              onChange={(e) => setW({ ...w, [k]: Number(e.target.value) })}
            />
          </Field>
        ))}
      </div>
      <Button
        className="mt-3"
        onClick={async () => {
          await api.put(`scoring?unitId=${unitId}`, { weights: w })
          await mutate(key)
          toast.show('Pesos salvos')
        }}
      >
        Salvar
      </Button>
      {toast.node}
    </Card>
  )
}

function FollowUpTab() {
  const { unitId } = useSession()
  const key = unitId ? `followup-policy?unitId=${unitId}` : null
  const { data } = useApi<{
    maxPerWeek: number
    minHoursBetween: number
    maxAttempts: number
    quietHoursStart: string
    quietHoursEnd: string
  }>(key)
  const [p, setP] = useState<typeof data | null>(null)
  const toast = useToast()
  useEffect(() => {
    if (data && !p) setP(data)
  }, [data, p])
  if (!p) return <p className="text-sm text-muted">Carregando…</p>
  return (
    <Card title="Política de follow-up">
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Máx. por semana">
          <Input
            type="number"
            value={p.maxPerWeek}
            onChange={(e) => setP({ ...p, maxPerWeek: Number(e.target.value) })}
          />
        </Field>
        <Field label="Mín. horas entre follow-ups">
          <Input
            type="number"
            value={p.minHoursBetween}
            onChange={(e) => setP({ ...p, minHoursBetween: Number(e.target.value) })}
          />
        </Field>
        <Field label="Máx. tentativas por lead">
          <Input
            type="number"
            value={p.maxAttempts}
            onChange={(e) => setP({ ...p, maxAttempts: Number(e.target.value) })}
          />
        </Field>
        <Field label="Silêncio a partir de">
          <Input
            type="time"
            value={p.quietHoursStart}
            onChange={(e) => setP({ ...p, quietHoursStart: e.target.value })}
          />
        </Field>
        <Field label="Silêncio até">
          <Input
            type="time"
            value={p.quietHoursEnd}
            onChange={(e) => setP({ ...p, quietHoursEnd: e.target.value })}
          />
        </Field>
      </div>
      <Button
        className="mt-3"
        onClick={async () => {
          await api.put(`followup-policy?unitId=${unitId}`, p)
          await mutate(key)
          toast.show('Política salva')
        }}
      >
        Salvar
      </Button>
      {toast.node}
    </Card>
  )
}

function UsersTab() {
  const { data } = useApi<{
    items: Array<{
      id: string
      name: string
      email: string
      role: string
      status: string
      lastLoginAt: string | null
    }>
  }>('users')
  const { me } = useSession()
  const toast = useToast()
  return (
    <div className="space-y-4">
      <Card title="Novo usuário">
        <form
          className="grid gap-2 md:grid-cols-5"
          onSubmit={async (e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            try {
              await api.post('users', {
                name: f.get('name'),
                email: f.get('email'),
                password: f.get('password'),
                role: f.get('role'),
                unitIds: me?.units.map((u) => u.id) ?? [],
              })
              await mutate('users')
              ;(e.target as HTMLFormElement).reset()
              toast.show('Usuário criado')
            } catch (err) {
              toast.show((err as Error).message, 'err')
            }
          }}
        >
          <Input name="name" placeholder="Nome" required />
          <Input name="email" type="email" placeholder="E-mail" required />
          <Input name="password" type="password" placeholder="Senha (8+)" required minLength={8} />
          <Select name="role" defaultValue="seller">
            <option value="seller">Vendedor</option>
            <option value="manager">Gestor</option>
            <option value="admin">Admin</option>
            <option value="viewer">Visualizador</option>
          </Select>
          <Button type="submit">Criar</Button>
        </form>
      </Card>
      <Card title="Usuários">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Papel</th>
              <th>Status</th>
              <th>Último login</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((u) => (
              <tr key={u.id} className="border-t">
                <td className="py-1.5">{u.name}</td>
                <td>{u.email}</td>
                <td>
                  <Badge tone="brand">{u.role}</Badge>
                </td>
                <td>{u.status}</td>
                <td className="text-xs text-muted">{fmtDate(u.lastLoginAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {toast.node}
    </div>
  )
}

function IntegrationsTab() {
  const { data } = useApi<{ runtime: Record<string, string | string[]>; items: unknown[] }>(
    'integrations',
  )
  const { data: templates } = useApi<{
    items: Array<{
      name: string
      language: string
      category: string
      status: string
      qualityScore: string | null
      lastSyncAt: string | null
    }>
  }>('templates')
  const toast = useToast()
  const rt = data?.runtime ?? {}
  const pending = (rt['pendingCredentials'] as string[] | undefined) ?? []
  return (
    <div className="space-y-4">
      <Card title="Providers em execução">
        <div className="grid gap-2 md:grid-cols-3">
          {[
            'llm',
            'embedding',
            'messaging',
            'stt',
            'calendar',
            'storage',
            'trace',
            'email',
            'conversion',
          ].map((k) => (
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
          ))}
        </div>
        {pending.length > 0 && (
          <div className="mt-3 rounded-md bg-amber-50 p-3 text-xs text-amber-900">
            <p className="font-medium">
              Credenciais pendentes (a plataforma opera em modo simulação até serem configuradas no
              .env):
            </p>
            <ul className="mt-1 list-disc pl-4">
              {pending.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>
      <Card
        title="Templates WhatsApp"
        actions={
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              const r = await api.post<{ synced: number; provider: string }>('templates/sync')
              await mutate('templates')
              toast.show(`${r.synced} templates sincronizados (${r.provider})`)
            }}
          >
            Sincronizar com a Meta
          </Button>
        }
      >
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th>Nome</th>
              <th>Idioma</th>
              <th>Categoria</th>
              <th>Status</th>
              <th>Qualidade</th>
              <th>Sync</th>
            </tr>
          </thead>
          <tbody>
            {(templates?.items ?? []).map((t) => (
              <tr key={`${t.name}-${t.language}`} className="border-t">
                <td className="py-1.5 font-mono text-xs">{t.name}</td>
                <td>{t.language}</td>
                <td>{t.category}</td>
                <td>
                  <Badge tone={t.status === 'approved' ? 'green' : 'amber'}>{t.status}</Badge>
                </td>
                <td>{t.qualityScore ?? '—'}</td>
                <td className="text-xs text-muted">{fmtDate(t.lastSyncAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {toast.node}
    </div>
  )
}

function AutomationsTab() {
  const { data } = useApi<{
    items: Array<{
      id: string
      name: string
      trigger: string
      active: boolean
      actions: Array<{ type: string }>
      runs: Array<{ status: string; createdAt: string }>
    }>
  }>('automations')
  const toast = useToast()
  return (
    <div className="space-y-4">
      <Card title="Nova automação (evento → ações)">
        <form
          className="grid gap-2 md:grid-cols-4"
          onSubmit={async (e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            try {
              await api.post('automations', {
                name: f.get('name'),
                trigger: f.get('trigger'),
                actions: JSON.parse(String(f.get('actions'))),
              })
              await mutate('automations')
              toast.show('Automação criada')
            } catch (err) {
              toast.show((err as Error).message, 'err')
            }
          }}
        >
          <Input name="name" placeholder="Nome" required />
          <Select name="trigger" defaultValue="lead.qualified">
            {[
              'lead.created',
              'lead.qualified',
              'stage.changed',
              'handoff.requested',
              'appointment.created',
              'appointment.no_show',
              'lead.inactive',
              'consent.revoked',
              'followup.sent',
              'lead.won',
              'lead.lost',
            ].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
          <Input
            name="actions"
            className="md:col-span-1"
            defaultValue='[{"type":"create_task","title":"Ligar para o lead","kind":"call","dueInHours":1}]'
          />
          <Button type="submit">Criar</Button>
          <p className="text-[11px] text-muted md:col-span-4">
            Ações: create_task, add_tag, assign_owner, change_stage, schedule_followup,
            send_message, send_template, call_webhook, send_email, notify_user (JSON).
          </p>
        </form>
      </Card>
      <Card title="Automações">
        {(data?.items ?? []).map((a) => (
          <div
            key={a.id}
            className="flex items-center justify-between border-b py-2 text-sm last:border-0"
          >
            <div>
              <p className="font-medium">{a.name}</p>
              <p className="text-xs text-muted">
                {a.trigger} → {a.actions.map((x) => x.type).join(', ')} ·{' '}
                {a.runs.length
                  ? `última execução ${a.runs[0]!.status} ${fmtDate(a.runs[0]!.createdAt)}`
                  : 'nunca executada'}
              </p>
            </div>
            <Toggle
              checked={a.active}
              onChange={async (v) => {
                await api.patch(`automations/${a.id}`, { active: v })
                await mutate('automations')
              }}
              label={a.active ? 'ativa' : 'inativa'}
            />
          </div>
        ))}
      </Card>
      {toast.node}
    </div>
  )
}

function AuditTab() {
  const { data } = useApi<{
    items: Array<{
      id: string
      action: string
      entityType: string
      entityId: string | null
      actor: string
      createdAt: string
      user: { name: string } | null
    }>
  }>('audit?limit=200')
  return (
    <Card title="Audit log">
      <table className="w-full text-xs">
        <thead className="text-left text-muted">
          <tr>
            <th>Quando</th>
            <th>Ação</th>
            <th>Entidade</th>
            <th>Ator</th>
          </tr>
        </thead>
        <tbody>
          {(data?.items ?? []).map((a) => (
            <tr key={a.id} className="border-t">
              <td className="py-1">{fmtDate(a.createdAt)}</td>
              <td className="font-mono">{a.action}</td>
              <td>
                {a.entityType} {a.entityId?.slice(0, 8)}
              </td>
              <td>{a.user?.name ?? a.actor}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
