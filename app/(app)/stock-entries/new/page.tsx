'use client'

import { useState, useEffect } from 'react'
import { createStockEntry } from '@/actions/stock-entries'
import { getMaterials } from '@/actions/materials'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Loader2, PackagePlus } from 'lucide-react'
import Link from 'next/link'
import type { Material } from '@prisma/client'

export default function NewStockEntryPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [materials, setMaterials] = useState<Material[]>([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [form, setForm] = useState({
    materialId: '',
    quantity: '',
    entryDate: new Date().toISOString().split('T')[0],
    notes: '',
  })

  useEffect(() => {
    getMaterials().then(m => setMaterials(m.filter(mat => mat.active)))
  }, [])

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const result = await createStockEntry({
      materialId: form.materialId,
      quantity: parseInt(form.quantity),
      entryDate: form.entryDate,
      notes: form.notes || undefined,
    })

    if (result?.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    setSuccess(true)
    setTimeout(() => router.push('/stock-entries'), 1500)
  }

  const selectedMaterial = materials.find(m => m.id === form.materialId)

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/stock-entries">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Nova Entrada de Estoque</h1>
          <p className="text-slate-500 text-sm">Registre o recebimento de materiais</p>
        </div>
      </div>

      {success && (
        <div className="rounded-xl bg-green-50 border border-green-200 px-5 py-4 text-green-800 font-medium flex items-center gap-2">
          ✓ Entrada registrada com sucesso! Redirecionando...
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <PackagePlus className="h-5 w-5 text-blue-600" />
            Dados da entrada
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label>Material *</Label>
              <Select value={form.materialId} onValueChange={v => set('materialId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o material..." />
                </SelectTrigger>
                <SelectContent>
                  {materials.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} ({m.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedMaterial && (
                <p className="text-xs text-slate-500">
                  Estoque atual: <strong>{selectedMaterial.stockCurrent}</strong> unidades
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="quantity">Quantidade recebida *</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  placeholder="0"
                  value={form.quantity}
                  onChange={e => set('quantity', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="entryDate">Data da entrada *</Label>
                <Input
                  id="entryDate"
                  type="date"
                  value={form.entryDate}
                  onChange={e => set('entryDate', e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                placeholder="Ex: Pedido #123 da franqueadora..."
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                rows={3}
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading || !form.materialId || !form.quantity} className="flex-1">
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Registrando...</> : 'Registrar Entrada'}
              </Button>
              <Link href="/stock-entries">
                <Button type="button" variant="outline">Cancelar</Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
