import { createTransaction } from '@/actions/balancete'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

const CATEGORIES_RECEITA = [
  'Mensalidade',
  'Doação',
  'Evento',
  'Patrocínio',
  'Outro',
]

const CATEGORIES_DESPESA = [
  'Aluguel',
  'Energia',
  'Água',
  'Internet',
  'Material',
  'Serviço',
  'Evento',
  'Transporte',
  'Outro',
]

export default function NovaTransacaoPage() {
  async function handleSubmit(formData: FormData) {
    'use server'
    await createTransaction(formData)
    redirect('/balancete')
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/balancete" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Nova Transação</h1>
          <p className="text-sm text-slate-500">Registrar receita ou despesa</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form action={handleSubmit} className="space-y-5">
            {/* Tipo */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Tipo *</label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 rounded-lg border-2 border-green-200 bg-green-50 px-4 py-3 cursor-pointer has-[:checked]:border-green-500 has-[:checked]:bg-green-100 transition-all">
                  <input type="radio" name="type" value="receita" defaultChecked className="accent-green-600" />
                  <span className="text-sm font-medium text-green-800">Receita</span>
                </label>
                <label className="flex items-center gap-2 rounded-lg border-2 border-red-200 bg-red-50 px-4 py-3 cursor-pointer has-[:checked]:border-red-500 has-[:checked]:bg-red-100 transition-all">
                  <input type="radio" name="type" value="despesa" className="accent-red-600" />
                  <span className="text-sm font-medium text-red-800">Despesa</span>
                </label>
              </div>
            </div>

            {/* Descrição */}
            <div className="space-y-1.5">
              <label htmlFor="description" className="text-sm font-medium text-slate-700">Descrição *</label>
              <input
                id="description"
                name="description"
                type="text"
                required
                placeholder="Ex: Mensalidade João Silva"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Categoria */}
            <div className="space-y-1.5">
              <label htmlFor="category" className="text-sm font-medium text-slate-700">Categoria *</label>
              <select
                id="category"
                name="category"
                required
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <optgroup label="Receitas">
                  {CATEGORIES_RECEITA.map(c => <option key={c} value={c}>{c}</option>)}
                </optgroup>
                <optgroup label="Despesas">
                  {CATEGORIES_DESPESA.map(c => <option key={c} value={c}>{c}</option>)}
                </optgroup>
              </select>
            </div>

            {/* Valor */}
            <div className="space-y-1.5">
              <label htmlFor="amount" className="text-sm font-medium text-slate-700">Valor (R$) *</label>
              <input
                id="amount"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0,00"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Data */}
            <div className="space-y-1.5">
              <label htmlFor="date" className="text-sm font-medium text-slate-700">Data *</label>
              <input
                id="date"
                name="date"
                type="date"
                required
                defaultValue={today}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Observações */}
            <div className="space-y-1.5">
              <label htmlFor="notes" className="text-sm font-medium text-slate-700">Observações</label>
              <textarea
                id="notes"
                name="notes"
                rows={2}
                placeholder="Opcional..."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Link
                href="/balancete"
                className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-center text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </Link>
              <button
                type="submit"
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                Salvar
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
