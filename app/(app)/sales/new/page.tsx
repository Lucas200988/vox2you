'use client'

import { useState, useEffect } from 'react'
import { createSale } from '@/actions/sales'
import { getMaterials } from '@/actions/materials'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Loader2, ShoppingCart, CheckCircle, Package, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { Material } from '@prisma/client'

const COURSES = ['MASTER', 'ACADEMY', 'INTENSIVOX']

const courseColors: Record<string, { selected: string; dot: string }> = {
  MASTER:     { selected: 'border-purple-400 bg-purple-50 text-purple-700', dot: 'bg-purple-400' },
  ACADEMY:    { selected: 'border-blue-400 bg-blue-50 text-blue-700',       dot: 'bg-blue-400' },
  INTENSIVOX: { selected: 'border-orange-400 bg-orange-50 text-orange-700', dot: 'bg-orange-400' },
}

export default function NewSalePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [materials, setMaterials] = useState<Material[]>([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [form, setForm] = useState({
    studentName: '',
    studentPhone: '',
    course: '',
    saleType: 'escola' as 'escola' | 'franqueadora',
    saleDate: new Date().toISOString().split('T')[0],
    notes: '',
  })

  useEffect(() => {
    getMaterials().then(setMaterials)
  }, [])

  function setField(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const selectedMaterial = materials.find(m => m.name === form.course)
  const isEscola = form.saleType === 'escola'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (isEscola && !selectedMaterial) {
      setError('Material não encontrado para este curso.')
      return
    }

    setLoading(true)
    setError('')

    const result = await createSale({
      studentName: form.studentName,
      studentPhone: form.studentPhone || undefined,
      course: form.course,
      saleType: form.saleType,
      saleDate: form.saleDate,
      notes: form.notes || undefined,
      items: isEscola && selectedMaterial
        ? [{ materialId: selectedMaterial.id, quantity: 1 }]
        : [],
    })

    if (result?.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    setSuccess(true)
    setTimeout(() => router.push('/sales'), 1800)
  }

  return (
    <div className="max-w-lg space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/sales">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Lançar Venda</h1>
          <p className="text-slate-500 text-sm">Registre a venda do aluno</p>
        </div>
      </div>

      {success && (
        <div className="rounded-xl bg-green-50 border border-green-200 px-5 py-4 text-green-800 font-medium flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
          {isEscola
            ? 'Venda lançada! Kit reservado e marcado como pendente de entrega.'
            : 'Venda lançada! Registrado que o aluno comprará o kit diretamente na franqueadora.'}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Kit */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Como o aluno receberá o kit? *</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setField('saleType', 'escola')}
                className={cn(
                  'flex flex-col items-start gap-1.5 rounded-xl border-2 p-4 text-left transition-all',
                  isEscola
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                )}
              >
                <Package className={cn('h-6 w-6', isEscola ? 'text-blue-600' : 'text-slate-400')} />
                <span className={cn('font-semibold text-sm', isEscola ? 'text-blue-700' : 'text-slate-600')}>
                  Kit do estoque
                </span>
                <span className="text-xs text-slate-400 leading-snug">
                  Kit reservado e entregue pelo admin
                </span>
              </button>

              <button
                type="button"
                onClick={() => setField('saleType', 'franqueadora')}
                className={cn(
                  'flex flex-col items-start gap-1.5 rounded-xl border-2 p-4 text-left transition-all',
                  !isEscola
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                )}
              >
                <ExternalLink className={cn('h-6 w-6', !isEscola ? 'text-purple-600' : 'text-slate-400')} />
                <span className={cn('font-semibold text-sm', !isEscola ? 'text-purple-700' : 'text-slate-600')}>
                  Aluno compra na franqueadora
                </span>
                <span className="text-xs text-slate-400 leading-snug">
                  Aluno compra o kit direto no site
                </span>
              </button>
            </div>

            {!isEscola && (
              <div className="mt-3 rounded-lg bg-purple-50 border border-purple-200 px-4 py-3 text-sm text-purple-800">
                O kit não sai do estoque da escola. A venda é registrada apenas para controle.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dados do aluno */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="h-5 w-5 text-blue-600" />
              Dados do aluno
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="studentName">Nome do aluno *</Label>
              <Input
                id="studentName"
                placeholder="Nome completo"
                value={form.studentName}
                onChange={e => setField('studentName', e.target.value)}
                required
                className="h-12 text-base"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="studentPhone">Telefone</Label>
              <Input
                id="studentPhone"
                placeholder="(11) 99999-9999"
                value={form.studentPhone}
                onChange={e => setField('studentPhone', e.target.value)}
                className="h-12"
              />
            </div>

            {/* Curso */}
            <div className="space-y-2">
              <Label>Curso vendido *</Label>
              <div className="grid grid-cols-3 gap-3">
                {COURSES.map(course => {
                  const mat = materials.find(m => m.name === course)
                  const stock = mat?.stockCurrent ?? 0
                  const isSelected = form.course === course
                  const colors = courseColors[course]
                  return (
                    <button
                      key={course}
                      type="button"
                      onClick={() => setField('course', course)}
                      className={cn(
                        'flex flex-col items-center justify-center rounded-xl border-2 p-4 transition-all',
                        isSelected ? colors.selected : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      )}
                    >
                      <span className="font-bold text-sm">{course}</span>
                      {isEscola && (
                        <span className={cn('text-xs mt-1', stock <= (mat?.stockMinimum ?? 5) ? 'text-red-500 font-medium' : 'text-slate-400')}>
                          {stock} em estoque
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="saleDate">Data da venda *</Label>
              <Input
                id="saleDate"
                type="date"
                value={form.saleDate}
                onChange={e => setField('saleDate', e.target.value)}
                required
                className="h-12"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                placeholder="Alguma observação sobre a venda..."
                value={form.notes}
                onChange={e => setField('notes', e.target.value)}
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Resumo */}
        {form.course && (
          <div className={cn(
            'rounded-xl border px-4 py-3 text-sm flex items-center gap-2',
            isEscola
              ? 'bg-slate-50 border-slate-200 text-slate-700'
              : 'bg-purple-50 border-purple-200 text-purple-800'
          )}>
            <span className={cn('h-2.5 w-2.5 rounded-full flex-shrink-0', courseColors[form.course]?.dot)} />
            {isEscola
              ? <>Kit <strong>{form.course}</strong> reservado do estoque — entrega pendente pelo admin.</>
              : <>Venda de <strong>{form.course}</strong> registrada — kit comprado pelo aluno na franqueadora, sem movimentação de estoque.</>
            }
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <Button
          type="submit"
          size="xl"
          className="w-full"
          disabled={loading || !form.course || !form.studentName}
        >
          {loading ? <><Loader2 className="h-5 w-5 animate-spin" /> Lançando...</> : 'Lançar Venda'}
        </Button>
      </form>
    </div>
  )
}
