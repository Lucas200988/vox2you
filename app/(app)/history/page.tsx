import { getHistory } from '@/actions/history'
import { getMaterials } from '@/actions/materials'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { History } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

const movementConfig: Record<string, { label: string; variant: 'success' | 'warning' | 'default' | 'destructive' | 'secondary'; sign: string }> = {
  entrada: { label: 'Entrada', variant: 'success', sign: '+' },
  venda_lancada: { label: 'Venda Lançada', variant: 'warning', sign: '−' },
  entrega: { label: 'Entrega', variant: 'default', sign: '−' },
  cancelamento: { label: 'Cancelamento', variant: 'secondary', sign: '+' },
  ajuste: { label: 'Ajuste', variant: 'secondary', sign: '±' },
  pedido_franqueadora: { label: 'Pedido Franqueadora', variant: 'default', sign: '−' },
}

export default async function HistoryPage() {
  const [movements, materials] = await Promise.all([
    getHistory(),
    getMaterials(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Histórico de Movimentações</h1>
        <p className="text-slate-500 mt-1">{movements.length} movimentações registradas</p>
      </div>

      {movements.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <History className="h-12 w-12 text-slate-300 mb-4" />
            <p className="text-slate-600 font-medium">Nenhuma movimentação registrada ainda</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Data/Hora</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Tipo</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Material</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600">Qtd</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Usuário</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Aluno</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Observação</th>
                </tr>
              </thead>
              <tbody>
                {movements.map(m => {
                  const config = movementConfig[m.type] ?? { label: m.type, variant: 'secondary' as const, sign: '±' }
                  const isPositive = m.quantity > 0
                  return (
                    <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatDateTime(m.createdAt)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={config.variant}>{config.label}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{m.material.name}</p>
                        <p className="text-xs text-slate-400">{m.material.code}</p>
                      </td>
                      <td className="px-4 py-3 text-center font-semibold">
                        <span className={isPositive ? 'text-green-600' : 'text-red-600'}>
                          {isPositive ? '+' : ''}{m.quantity}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{m.user.name}</td>
                      <td className="px-4 py-3 text-slate-500">{m.sale?.studentName ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-400 max-w-[200px] truncate">{m.notes ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
