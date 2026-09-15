'use client'

import { useState } from 'react'
import { mutate } from 'swr'
import { api, useApi } from '@/lib/api'
import { useSession } from '@/lib/session'
import { brl } from '@/lib/utils'
import {
  Badge,
  Button,
  Card,
  Dialog,
  Field,
  Input,
  Select,
  Textarea,
  Toggle,
  useToast,
} from '@/components/ui/primitives'

interface Offer {
  id: string
  name: string
  listPrice: string
  promoPrice: string | null
  installmentsMax: number | null
  installmentValue: string | null
  conditions: string | null
  maxDiscountPct: string
  status: string
  validTo: string | null
  unitId: string | null
}
interface ClassSchedule {
  id: string
  name: string
  startsOn: string
  weekdays: string[]
  startTime: string
  endTime: string
  capacity: number
  enrolled: number
  status: string
  period: string | null
}
interface Product {
  id: string
  slug: string
  name: string
  category: string
  modality: string | null
  audience: string | null
  shortDescription: string | null
  durationText: string | null
  personas: string[]
  painsSolved: string[]
  benefits: string[]
  salesArguments: string[]
  status: string
  offers: Offer[]
  classSchedules: ClassSchedule[]
}

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const WD_LABEL: Record<string, string> = {
  mon: 'Seg',
  tue: 'Ter',
  wed: 'Qua',
  thu: 'Qui',
  fri: 'Sex',
  sat: 'Sáb',
  sun: 'Dom',
}

export default function ProductsPage() {
  const { unitId, can } = useSession()
  const key = unitId ? `products/?unitId=${unitId}&includeInactive=true` : null
  const { data } = useApi<{ items: Product[] }>(key)
  const toast = useToast()
  const [editing, setEditing] = useState<Partial<Product> | null>(null)
  const [offerFor, setOfferFor] = useState<{ product: Product; offer?: Offer } | null>(null)
  const [classFor, setClassFor] = useState<{ product: Product; cls?: ClassSchedule } | null>(null)
  const refresh = () => mutate(key)
  const list = (v: string) =>
    v
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Produtos e ofertas</h1>
          <p className="text-xs text-muted">
            Esta é a única fonte de preços, condições e turmas que o agente usa. Nada aqui entra no
            prompt como texto livre.
          </p>
        </div>
        {can('manager') && (
          <Button
            onClick={() =>
              setEditing({
                category: 'course',
                status: 'active',
                personas: [],
                painsSolved: [],
                benefits: [],
                salesArguments: [],
              })
            }
          >
            Novo produto
          </Button>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {(data?.items ?? []).map((p) => (
          <Card
            key={p.id}
            title={
              <span className="flex items-center gap-2">
                {p.name} <Badge tone={p.status === 'active' ? 'green' : 'slate'}>{p.status}</Badge>
                <span className="text-xs font-normal text-muted">
                  {p.category}
                  {p.modality ? ` · ${p.modality}` : ''}
                  {p.durationText ? ` · ${p.durationText}` : ''}
                </span>
              </span>
            }
            actions={
              can('manager') && (
                <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                  Editar
                </Button>
              )
            }
          >
            <p className="text-sm text-slate-600">{p.shortDescription}</p>
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Ofertas</p>
                {can('manager') && (
                  <Button size="sm" variant="ghost" onClick={() => setOfferFor({ product: p })}>
                    + oferta
                  </Button>
                )}
              </div>
              {p.offers.length ? (
                p.offers.map((o) => (
                  <div
                    key={o.id}
                    className="flex items-center justify-between rounded-md border px-2 py-1.5 text-xs"
                  >
                    <div>
                      <p className="font-medium">
                        {o.name} {o.status !== 'active' && <Badge tone="slate">inativa</Badge>}
                        {o.unitId === null && <Badge tone="blue">todas unidades</Badge>}
                      </p>
                      <p className="text-muted">
                        {o.promoPrice ? (
                          <>
                            <s>{brl(o.listPrice)}</s> {brl(o.promoPrice)}
                          </>
                        ) : (
                          brl(o.listPrice)
                        )}
                        {o.installmentsMax && o.installmentValue
                          ? ` · ${o.installmentsMax}x ${brl(o.installmentValue)}`
                          : ''}{' '}
                        · desconto máx {Number(o.maxDiscountPct)}%
                        {o.validTo ? ` · até ${o.validTo.slice(0, 10)}` : ''}
                      </p>
                    </div>
                    {can('manager') && (
                      <button
                        type="button"
                        className="text-brand-700 hover:underline"
                        onClick={() => setOfferFor({ product: p, offer: o })}
                      >
                        editar
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-xs text-amber-700">
                  Sem oferta vigente — o agente não citará valores deste produto.
                </p>
              )}
            </div>
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Turmas</p>
                {can('manager') && (
                  <Button size="sm" variant="ghost" onClick={() => setClassFor({ product: p })}>
                    + turma
                  </Button>
                )}
              </div>
              {p.classSchedules.length ? (
                p.classSchedules.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-md border px-2 py-1.5 text-xs"
                  >
                    <p>
                      <span className="font-medium">{c.name}</span> ·{' '}
                      {c.weekdays.map((w) => WD_LABEL[w]).join('/')} {c.startTime}–{c.endTime} ·
                      início {c.startsOn.slice(0, 10)} · {Math.max(0, c.capacity - c.enrolled)}{' '}
                      vagas <Badge tone={c.status === 'open' ? 'green' : 'slate'}>{c.status}</Badge>
                    </p>
                    {can('manager') && (
                      <button
                        type="button"
                        className="text-brand-700 hover:underline"
                        onClick={() => setClassFor({ product: p, cls: c })}
                      >
                        editar
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted">Nenhuma turma cadastrada.</p>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Editar produto' : 'Novo produto'}
        wide
      >
        {editing && (
          <form
            className="grid gap-3 md:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault()
              const f = new FormData(e.currentTarget)
              const body = {
                name: f.get('name'),
                category: f.get('category'),
                modality: f.get('modality') || undefined,
                audience: f.get('audience') || undefined,
                shortDescription: f.get('shortDescription') || undefined,
                durationText: f.get('durationText') || undefined,
                personas: list(String(f.get('personas'))),
                painsSolved: list(String(f.get('painsSolved'))),
                benefits: list(String(f.get('benefits'))),
                salesArguments: list(String(f.get('salesArguments'))),
                status: f.get('status'),
              }
              try {
                if (editing.id) await api.patch(`products/${editing.id}`, body)
                else await api.post('products/', body)
                await refresh()
                setEditing(null)
                toast.show('Produto salvo')
              } catch (err) {
                toast.show((err as Error).message, 'err')
              }
            }}
          >
            <Field label="Nome">
              <Input name="name" defaultValue={editing.name} required />
            </Field>
            <Field label="Categoria">
              <Select name="category" defaultValue={editing.category ?? 'course'}>
                <option value="course">Curso</option>
                <option value="workshop">Workshop</option>
                <option value="incompany">InCompany</option>
                <option value="immersion">Imersão</option>
                <option value="event">Evento</option>
                <option value="other">Outro</option>
              </Select>
            </Field>
            <Field label="Modalidade">
              <Select name="modality" defaultValue={editing.modality ?? ''}>
                <option value="">—</option>
                <option value="in_person">Presencial</option>
                <option value="online">Online</option>
                <option value="hybrid">Híbrido</option>
              </Select>
            </Field>
            <Field label="Público">
              <Select name="audience" defaultValue={editing.audience ?? ''}>
                <option value="">—</option>
                <option value="b2c">B2C</option>
                <option value="b2b">B2B</option>
                <option value="both">Ambos</option>
              </Select>
            </Field>
            <Field label="Duração (texto)">
              <Input name="durationText" defaultValue={editing.durationText ?? ''} />
            </Field>
            <Field label="Status">
              <Select name="status" defaultValue={editing.status ?? 'active'}>
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
                <option value="draft">Rascunho</option>
              </Select>
            </Field>
            <div className="md:col-span-2">
              <Field label="Descrição curta">
                <Textarea
                  name="shortDescription"
                  rows={2}
                  defaultValue={editing.shortDescription ?? ''}
                />
              </Field>
            </div>
            <Field label="Personas (uma por linha)">
              <Textarea name="personas" rows={3} defaultValue={editing.personas?.join('\n')} />
            </Field>
            <Field label="Dores resolvidas (uma por linha)">
              <Textarea
                name="painsSolved"
                rows={3}
                defaultValue={editing.painsSolved?.join('\n')}
              />
            </Field>
            <Field label="Benefícios (um por linha)">
              <Textarea name="benefits" rows={3} defaultValue={editing.benefits?.join('\n')} />
            </Field>
            <Field label="Argumentos comerciais (um por linha)">
              <Textarea
                name="salesArguments"
                rows={3}
                defaultValue={editing.salesArguments?.join('\n')}
              />
            </Field>
            <div className="flex justify-end gap-2 md:col-span-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button type="submit">Salvar</Button>
            </div>
          </form>
        )}
      </Dialog>

      <Dialog
        open={!!offerFor}
        onClose={() => setOfferFor(null)}
        title={offerFor?.offer ? 'Editar oferta' : `Nova oferta — ${offerFor?.product.name}`}
      >
        {offerFor && (
          <OfferForm
            unitId={unitId}
            product={offerFor.product}
            offer={offerFor.offer}
            onDone={async () => {
              await refresh()
              setOfferFor(null)
              toast.show('Oferta salva')
            }}
            onError={(m) => toast.show(m, 'err')}
          />
        )}
      </Dialog>
      <Dialog
        open={!!classFor}
        onClose={() => setClassFor(null)}
        title={classFor?.cls ? 'Editar turma' : `Nova turma — ${classFor?.product.name}`}
      >
        {classFor && (
          <ClassForm
            unitId={unitId}
            product={classFor.product}
            cls={classFor.cls}
            onDone={async () => {
              await refresh()
              setClassFor(null)
              toast.show('Turma salva')
            }}
            onError={(m) => toast.show(m, 'err')}
          />
        )}
      </Dialog>
      {toast.node}
    </div>
  )
}

function OfferForm({
  unitId,
  product,
  offer,
  onDone,
  onError,
}: {
  unitId: string
  product: Product
  offer?: Offer
  onDone: () => void
  onError: (m: string) => void
}) {
  const [allUnits, setAllUnits] = useState(offer ? offer.unitId === null : false)
  return (
    <form
      className="grid gap-3 md:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        const num = (k: string) => (f.get(k) ? Number(String(f.get(k)).replace(',', '.')) : null)
        const body = {
          unitId: allUnits ? null : unitId,
          name: f.get('name'),
          listPrice: num('listPrice') ?? 0,
          promoPrice: num('promoPrice'),
          installmentsMax: num('installmentsMax'),
          installmentValue: num('installmentValue'),
          conditions: f.get('conditions') || undefined,
          maxDiscountPct: num('maxDiscountPct') ?? 0,
          validTo: f.get('validTo') ? new Date(String(f.get('validTo'))).toISOString() : null,
          status: f.get('status'),
          paymentMethods: ['pix', 'card'],
        }
        try {
          if (offer) await api.patch(`products/offers/${offer.id}`, body)
          else await api.post(`products/${product.id}/offers`, body)
          onDone()
        } catch (err) {
          onError((err as Error).message)
        }
      }}
    >
      <Field label="Nome da oferta">
        <Input
          name="name"
          defaultValue={offer?.name ?? `${product.name} — turma regular`}
          required
        />
      </Field>
      <Field label="Status">
        <Select name="status" defaultValue={offer?.status ?? 'active'}>
          <option value="active">Ativa</option>
          <option value="inactive">Inativa</option>
        </Select>
      </Field>
      <Field label="Preço de lista (R$)">
        <Input
          name="listPrice"
          type="number"
          step="0.01"
          defaultValue={offer?.listPrice ?? ''}
          required
        />
      </Field>
      <Field label="Preço promocional (R$)">
        <Input name="promoPrice" type="number" step="0.01" defaultValue={offer?.promoPrice ?? ''} />
      </Field>
      <Field label="Parcelas (máx)">
        <Input name="installmentsMax" type="number" defaultValue={offer?.installmentsMax ?? ''} />
      </Field>
      <Field label="Valor da parcela (R$)">
        <Input
          name="installmentValue"
          type="number"
          step="0.01"
          defaultValue={offer?.installmentValue ?? ''}
        />
      </Field>
      <Field label="Desconto máximo (%)" hint="Acima disso o agente encaminha para um humano">
        <Input
          name="maxDiscountPct"
          type="number"
          step="0.5"
          defaultValue={offer?.maxDiscountPct ?? '0'}
        />
      </Field>
      <Field label="Válida até">
        <Input name="validTo" type="date" defaultValue={offer?.validTo?.slice(0, 10) ?? ''} />
      </Field>
      <div className="md:col-span-2">
        <Field label="Condições (texto que o agente pode citar)">
          <Textarea name="conditions" rows={2} defaultValue={offer?.conditions ?? ''} />
        </Field>
      </div>
      <div className="md:col-span-2">
        <Toggle checked={allUnits} onChange={setAllUnits} label="Válida para todas as unidades" />
      </div>
      <div className="flex justify-end md:col-span-2">
        <Button type="submit">Salvar oferta</Button>
      </div>
    </form>
  )
}

function ClassForm({
  unitId,
  product,
  cls,
  onDone,
  onError,
}: {
  unitId: string
  product: Product
  cls?: ClassSchedule
  onDone: () => void
  onError: (m: string) => void
}) {
  const [days, setDays] = useState<string[]>(cls?.weekdays ?? ['tue'])
  return (
    <form
      className="grid gap-3 md:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        const body = {
          unitId,
          name: f.get('name'),
          startsOn: f.get('startsOn'),
          weekdays: days,
          startTime: f.get('startTime'),
          endTime: f.get('endTime'),
          period: f.get('period') || undefined,
          capacity: Number(f.get('capacity')),
          enrolled: Number(f.get('enrolled')),
          status: f.get('status'),
        }
        try {
          if (cls) await api.patch(`products/classes/${cls.id}`, body)
          else await api.post(`products/${product.id}/classes`, body)
          onDone()
        } catch (err) {
          onError((err as Error).message)
        }
      }}
    >
      <Field label="Nome">
        <Input name="name" defaultValue={cls?.name ?? ''} required />
      </Field>
      <Field label="Início">
        <Input
          name="startsOn"
          type="date"
          defaultValue={cls?.startsOn?.slice(0, 10) ?? ''}
          required
        />
      </Field>
      <div className="md:col-span-2">
        <p className="mb-1 text-xs font-medium text-muted">Dias</p>
        <div className="flex gap-1">
          {WEEKDAYS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])}
              className={`rounded-md border px-2 py-1 text-xs ${days.includes(d) ? 'bg-brand-600 text-white' : ''}`}
            >
              {WD_LABEL[d]}
            </button>
          ))}
        </div>
      </div>
      <Field label="Hora início">
        <Input name="startTime" type="time" defaultValue={cls?.startTime ?? '19:00'} required />
      </Field>
      <Field label="Hora fim">
        <Input name="endTime" type="time" defaultValue={cls?.endTime ?? '21:00'} required />
      </Field>
      <Field label="Período">
        <Select name="period" defaultValue={cls?.period ?? 'evening'}>
          <option value="morning">Manhã</option>
          <option value="afternoon">Tarde</option>
          <option value="evening">Noite</option>
        </Select>
      </Field>
      <Field label="Status">
        <Select name="status" defaultValue={cls?.status ?? 'open'}>
          <option value="open">Aberta</option>
          <option value="full">Cheia</option>
          <option value="closed">Fechada</option>
          <option value="cancelled">Cancelada</option>
        </Select>
      </Field>
      <Field label="Capacidade">
        <Input name="capacity" type="number" defaultValue={cls?.capacity ?? 12} />
      </Field>
      <Field label="Matriculados">
        <Input name="enrolled" type="number" defaultValue={cls?.enrolled ?? 0} />
      </Field>
      <div className="flex justify-end md:col-span-2">
        <Button type="submit">Salvar turma</Button>
      </div>
    </form>
  )
}
