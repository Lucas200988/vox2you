'use client'

import { useState } from 'react'
import { createMaterial } from '@/actions/materials'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Loader2, Package } from 'lucide-react'
import Link from 'next/link'

const MATERIAL_TYPES = ['Apostila', 'Livro', 'Kit', 'Caderno', 'Caneta', 'Material complementar', 'Outro']

export default function NewMaterialPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '', code: '', type: '', stockMinimum: '5', notes: ''
  })

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const result = await createMaterial({
      name: form.name,
      code: form.code,
      type: form.type,
      stockMinimum: parseInt(form.stockMinimum) || 0,
      notes: form.notes || undefined,
    })

    if (result?.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    router.push('/materials')
  }

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/materials">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Novo Material</h1>
          <p className="text-slate-500 text-sm">Cadastre um novo material didático</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-5 w-5 text-blue-600" />
            Dados do material
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome do material *</Label>
              <Input
                id="name"
                placeholder="Ex: Apostila Módulo 1"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="code">Código interno *</Label>
                <Input
                  id="code"
                  placeholder="Ex: AP-MOD1"
                  value={form.code}
                  onChange={e => set('code', e.target.value.toUpperCase())}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo *</Label>
                <Select value={form.type} onValueChange={v => set('type', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {MATERIAL_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="stockMinimum">Estoque mínimo *</Label>
              <Input
                id="stockMinimum"
                type="number"
                min="0"
                placeholder="5"
                value={form.stockMinimum}
                onChange={e => set('stockMinimum', e.target.value)}
                required
              />
              <p className="text-xs text-slate-400">O sistema alertará quando o estoque disponível chegar neste valor.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                placeholder="Informações adicionais sobre o material..."
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
              <Button type="submit" disabled={loading || !form.type} className="flex-1">
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</> : 'Salvar Material'}
              </Button>
              <Link href="/materials">
                <Button type="button" variant="outline">Cancelar</Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
