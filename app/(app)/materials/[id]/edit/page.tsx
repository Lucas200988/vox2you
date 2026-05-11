'use client'

import { useState, useEffect } from 'react'
import { getMaterial, updateMaterial } from '@/actions/materials'
import { useRouter, useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Loader2, Package } from 'lucide-react'
import Link from 'next/link'

const MATERIAL_TYPES = ['Apostila', 'Livro', 'Kit', 'Caderno', 'Caneta', 'Material complementar', 'Outro']

export default function EditMaterialPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '', code: '', type: '', stockMinimum: '5', active: true, notes: ''
  })

  useEffect(() => {
    async function load() {
      setLoading(true)
      const m = await getMaterial(id)
      if (m) {
        setForm({
          name: m.name,
          code: m.code,
          type: m.type,
          stockMinimum: String(m.stockMinimum),
          active: m.active,
          notes: m.notes ?? '',
        })
      }
      setLoading(false)
    }
    load()
  }, [id])

  function set(field: string, value: string | boolean) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const result = await updateMaterial(id, {
      name: form.name,
      code: form.code,
      type: form.type,
      stockMinimum: parseInt(form.stockMinimum) || 0,
      active: form.active,
      notes: form.notes || undefined,
    }) as { success?: boolean; error?: string } | undefined

    if (result?.error) {
      setError(result.error)
      setSaving(false)
      return
    }

    router.push('/materials')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/materials">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Editar Material</h1>
          <p className="text-slate-500 text-sm">Atualize as informações do material</p>
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
                  value={form.code}
                  onChange={e => set('code', e.target.value.toUpperCase())}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo *</Label>
                <Select value={form.type} onValueChange={v => set('type', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MATERIAL_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="stockMinimum">Estoque mínimo</Label>
                <Input
                  id="stockMinimum"
                  type="number"
                  min="0"
                  value={form.stockMinimum}
                  onChange={e => set('stockMinimum', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.active ? 'true' : 'false'} onValueChange={v => set('active', v === 'true')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Ativo</SelectItem>
                    <SelectItem value="false">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
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
              <Button type="submit" disabled={saving} className="flex-1">
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</> : 'Salvar Alterações'}
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
