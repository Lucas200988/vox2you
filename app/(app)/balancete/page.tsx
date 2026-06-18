import { getBalanceSummary } from '@/actions/balancete'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, TrendingDown, Scale, Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { DeleteTransactionButton } from './delete-button'

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function fmt(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export default async function BalancetePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>
}) {
  const params = await searchParams
  const now = new Date()
  const month = parseInt(params.month ?? String(now.getMonth() + 1))
  const year = parseInt(params.year ?? String(now.getFullYear()))

  const { receitas, despesas, saldo, byCategory, transactions } = await getBalanceSummary(month, year)

  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Balancete Financeiro</h1>
          <p className="text-slate-500 mt-1">Controle de receitas e despesas da associação</p>
        </div>
        <Link
          href="/balancete/nova-transacao"
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nova Transação
        </Link>
      </div>

      {/* Month navigator */}
      <div className="flex items-center gap-4">
        <Link
          href={`/balancete?month=${prevMonth}&year=${prevYear}`}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
        >
          ← {MONTH_NAMES[prevMonth - 1]}
        </Link>
        <span className="text-base font-semibold text-slate-900">
          {MONTH_NAMES[month - 1]} {year}
        </span>
        <Link
          href={`/balancete?month=${nextMonth}&year=${nextYear}`}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
        >
          {MONTH_NAMES[nextMonth - 1]} →
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-700 font-medium">Total Receitas</p>
                <p className="text-2xl font-bold text-green-800 mt-1">{fmt(receitas)}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-700 font-medium">Total Despesas</p>
                <p className="text-2xl font-bold text-red-800 mt-1">{fmt(despesas)}</p>
              </div>
              <TrendingDown className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card className={saldo >= 0 ? 'border-blue-200 bg-blue-50' : 'border-orange-200 bg-orange-50'}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm font-medium ${saldo >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>Saldo do Mês</p>
                <p className={`text-2xl font-bold mt-1 ${saldo >= 0 ? 'text-blue-800' : 'text-orange-800'}`}>{fmt(saldo)}</p>
              </div>
              <Scale className={`h-8 w-8 ${saldo >= 0 ? 'text-blue-500' : 'text-orange-500'}`} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* By category */}
      {Object.keys(byCategory).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(byCategory).map(([cat, vals]: [string, { receita: number; despesa: number }]) => (
                <div key={cat} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <span className="text-sm font-medium text-slate-700">{cat}</span>
                  <div className="flex gap-4 text-sm">
                    {vals.receita > 0 && <span className="text-green-600 font-medium">+{fmt(vals.receita)}</span>}
                    {vals.despesa > 0 && <span className="text-red-600 font-medium">-{fmt(vals.despesa)}</span>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transactions list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lançamentos</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-slate-400 text-sm">Nenhum lançamento neste mês.</p>
              <Link href="/balancete/nova-transacao" className="mt-2 inline-block text-sm text-blue-600 hover:underline">
                Adicionar primeiro lançamento
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((t: Parameters<typeof getBalanceSummary>[0] extends never ? never : Awaited<ReturnType<typeof getBalanceSummary>>['transactions'][number]) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-lg border border-slate-100 px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`h-2 w-2 rounded-full flex-shrink-0 ${t.type === 'receita' ? 'bg-green-500' : 'bg-red-500'}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{t.description}</p>
                      <p className="text-xs text-slate-400">
                        {t.category} · {new Date(t.date).toLocaleDateString('pt-BR')} · {t.createdBy.name}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                    <span className={`text-sm font-semibold ${t.type === 'receita' ? 'text-green-700' : 'text-red-700'}`}>
                      {t.type === 'receita' ? '+' : '-'}{fmt(Number(t.amount))}
                    </span>
                    <Badge variant={t.type === 'receita' ? 'default' : 'destructive'} className="text-xs hidden sm:flex">
                      {t.type}
                    </Badge>
                    <DeleteTransactionButton id={t.id} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
