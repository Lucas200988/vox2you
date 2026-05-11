'use client'

import { useState, useEffect } from 'react'
import { createPurchaseOrder } from '@/actions/purchase-orders'
import { getMaterials } from '@/actions/materials'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Loader2, ClipboardList, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import type { Material } from '@prisma/client'

const PRODUCTS = ['MASTER', 'ACADEMY', 'INTENSIVOX']
const productColors: Record<string, string> = {
  MASTER:     'border-purple-300 bg-purple-50 text-purple-700',
  ACADEMY:    'border-blue-300 bg-blue-50 text-blue-700',
  INTENSIVOX: 'border-orange-300 bg-orange-50 text-orange-700',
}

export default function NewPurchaseOrderPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [materials, setMaterials] = useState<Material[]>([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [form, setForm] = useState({
    materialId: '',
    quantity: '1',
    orderDate: new Date().toISOString().split('T')[0],
    expectedDate: '',
    notes: '',
  })

  useEffect(() => {
    getMaterials().then(ms => setMaterials(ms.filter(m => PRODUCTS.includes(m.name))))
  }, [])

  function setField(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const selectedMaterial = materials.find(m => m.id === form.materialId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const result = await createPurchaseOrder({
      materialId: form.materialId,
      quantity: parseInt(form.quantity),
      orderDate: form.orderDate,
      expectedDate: form.expectedDate || undefined,
      notes: form.notes || undefined,
    }) as { success?: boolean; error?: string } | undefined

    if (result?.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    setSuccess(true)
    setTimeout(() => router.push('/purchase-orders'), 1500)
  }

  return (
    <div className="max-w-lg space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/purchase-orders">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Novo Pedido</h1>
          <p className="text-slate-500 text-sm">Registre o pedido à franqueadora</p>
        </div>
      </div>

      {success && (
        <div className="rounded-xl bg-green-50 border border-green-200 px-5 py-4 text-green-800 font-medium flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-green-600" />
          Pedido registrado! Quando chegar, marque como recebido.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-5 w-5 text-blue-600" />
            Dados do pedido
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Produto — 3 botões */}
            <div className="space-y-2">
              <Label>Produto *</Label>
              <div className="grid grid-cols-3 gap-3">
                {PRODUCTS.map(name => {
                  const mat = materials.find(m => m.name === name)
                  const isSelected = form.materialId === mat?.id
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => mat && setField('materialId', mat.id)}
                      className={`flex flex-col items-center justify-center rounded-xl border-2 p-4 transition-all font-bold text-sm ${
                        isSelected
                          ? productColors[name]
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {name}
                      {mat && (
                        <span className="text-xs font-normal mt-1 text-slate-400">
                          {mat.stockCurrent} em estoque
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Quantidade */}
            <div className="space-y-1.5">
              <Label htmlFor="quantity">Quantidade pedida *</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                value={form.quantity}
                onChange={e => setField('quantity', e.target.value)}
                required
                className="h-12 text-base"
              />
            </div>

            {/* Datas */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="orderDate">Data do pedido *</Label>
                <Input
                  id="orderDate"
                  type="date"
                  value={form.orderDate}
                  onChange={e => setField('orderDate', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="expectedDate">Previsão de chegada</Label>
                <Input
                  id="expectedDate"
                  type="date"
                  value={form.expectedDate}
                  onChange={e => setField('expectedDate', e.target.value)}
                />
              </div>
            </div>

            {/* Observações */}
            <div className="space-y-1.5">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                placeholder="Número do pedido, contato na franqueadora..."
                value={form.notes}
                onChange={e => setField('notes', e.target.value)}
                rows={2}
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
            )}

            <Button type="submit" size="xl" className="w-full" disabled={loading || !form.materialId}>
              {loading ? <><Loader2 className="h-5 w-5 animate-spin" /> Registrando...</> : 'Registrar Pedido'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
