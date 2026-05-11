import { getStockEntries } from '@/actions/stock-entries'
import { Card, CardContent } from '@/components/ui/card'
import { PackagePlus, Plus } from 'lucide-react'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'

export default async function StockEntriesPage() {
  const entries = await getStockEntries()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Entrada de Estoque</h1>
          <p className="text-slate-500 mt-1">{entries.length} entradas registradas</p>
        </div>
        <Link
          href="/stock-entries/new"
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nova Entrada
        </Link>
      </div>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <PackagePlus className="h-12 w-12 text-slate-300 mb-4" />
            <p className="text-slate-600 font-medium">Nenhuma entrada registrada</p>
            <p className="text-slate-400 text-sm mt-1">Registre a primeira entrada de estoque.</p>
            <Link href="/stock-entries/new" className="mt-4 text-blue-600 text-sm font-medium hover:underline">
              Registrar entrada
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Material</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Código</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600">Quantidade</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Data</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Responsável</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Observações</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(entry => (
                  <tr key={entry.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{entry.material.name}</td>
                    <td className="px-4 py-3 text-slate-500">{entry.material.code}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">
                        +{entry.quantity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(entry.entryDate)}</td>
                    <td className="px-4 py-3 text-slate-600">{entry.responsible.name}</td>
                    <td className="px-4 py-3 text-slate-400">{entry.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
