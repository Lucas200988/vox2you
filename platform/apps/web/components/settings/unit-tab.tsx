'use client'

import { useEffect, useState } from 'react'
import { mutate } from 'swr'
import { api, useApi } from '@/lib/api'
import { useSession } from '@/lib/session'
import { Button, Card, Field, Input, Select, useToast } from '@/components/ui/primitives'

interface Unit {
  id: string
  name: string
  slug: string
  timezone: string
  city: string | null
  state: string | null
  address: string | null
  phone: string | null
  email: string | null
  status: string
}

const TIMEZONES = [
  'America/Cuiaba',
  'America/Sao_Paulo',
  'America/Manaus',
  'America/Belem',
  'America/Fortaleza',
  'America/Recife',
  'America/Bahia',
  'America/Campo_Grande',
  'America/Porto_Velho',
  'America/Rio_Branco',
  'America/Boa_Vista',
  'America/Noronha',
]

/** Unit profile: what the agent says when confirming a visit (address, phone) and its timezone. */
export function UnitTab() {
  const { unitId } = useSession()
  const { data } = useApi<{ items: Unit[] }>('units')
  const unit = data?.items.find((u) => u.id === unitId)
  const [form, setForm] = useState<Partial<Unit> | null>(null)
  const toast = useToast()
  useEffect(() => {
    if (unit) setForm(unit)
  }, [unit])
  if (!unit || !form) return <p className="text-sm text-muted">Carregando…</p>
  const set = (k: keyof Unit, v: string) => setForm({ ...form, [k]: v })

  return (
    <div className="space-y-4">
      <Card title={`Unidade ${unit.name}`}>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Nome">
            <Input value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field
            label="Fuso horário"
            hint="Usado em horários de visita e no horário de atendimento"
          >
            <Select value={form.timezone ?? ''} onChange={(e) => set('timezone', e.target.value)}>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cidade">
            <Input value={form.city ?? ''} onChange={(e) => set('city', e.target.value)} />
          </Field>
          <Field label="UF">
            <Input value={form.state ?? ''} onChange={(e) => set('state', e.target.value)} />
          </Field>
          <div className="md:col-span-2">
            <Field
              label="Endereço completo"
              hint="O agente envia este endereço ao confirmar a visita presencial"
            >
              <Input
                value={form.address ?? ''}
                placeholder="Rua, número, bairro, referência"
                onChange={(e) => set('address', e.target.value)}
              />
            </Field>
          </div>
          <Field label="Telefone de contato da unidade">
            <Input
              value={form.phone ?? ''}
              placeholder="+55 65 9xxxx-xxxx"
              onChange={(e) => set('phone', e.target.value)}
            />
          </Field>
          <Field label="E-mail da unidade">
            <Input value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} />
          </Field>
        </div>
        <div className="mt-3">
          <Button
            onClick={async () => {
              try {
                await api.patch(`units/${unit.id}`, {
                  name: form.name,
                  timezone: form.timezone,
                  city: form.city || null,
                  state: form.state || null,
                  address: form.address || null,
                  phone: form.phone || null,
                  email: form.email || null,
                })
                await mutate('units')
                toast.show('Unidade salva')
              } catch (e) {
                toast.show((e as Error).message, 'err')
              }
            }}
          >
            Salvar
          </Button>
        </div>
      </Card>
      {toast.node}
    </div>
  )
}
