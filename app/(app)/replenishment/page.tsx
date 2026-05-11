import { getMaterialsWithStock } from '@/actions/materials'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { BarChart3, CheckCircle, AlertTriangle } from 'lucide-react'

export default async function ReplenishmentPage() {
  const materials = await getMaterialsWithStock()

  const needsReplenishment = materials.filter(m => m.needsReplenishment)
  const ok = materials.filter(m => !m.needsReplenishment)

  function suggestedOrder(m: typeof materials[0]) {
    return Math.max(m.stockMinimum * 2 - m.availableQty, m.stockMinimum)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Relatório de Reposição</h1>
        <p className="text-slate-500 mt-1">Materiais que precisam ser pedidos à franqueadora</p>
      </div>

      {needsReplenishment.length === 0 ? (
        <Alert variant="success">
          <CheckCircle className="h-4 w-4" />
          <AlertTitle>Estoque saudável!</AlertTitle>
          <AlertDescription>
            Todos os materiais estão acima do estoque mínimo. Nenhum pedido necessário no momento.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{needsReplenishment.length} material{needsReplenishment.length !== 1 ? 'is' : ''} precisam de reposição</AlertTitle>
          <AlertDescription>
            Faça o pedido à franqueadora para os itens abaixo.
          </AlertDescription>
        </Alert>
      )}

      {needsReplenishment.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-amber-600" />
              Comprar Agora
            </CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-amber-50">
                  <th className="text-left px-4 py-3 font-semibold text-slate-700">Material</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700">Código</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-700">Em Estoque</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-700">Pendente</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-700">Disponível Real</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-700">Mínimo</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-700">Sugestão de Pedido</th>
                </tr>
              </thead>
              <tbody>
                {needsReplenishment.map(m => (
                  <tr key={m.id} className="border-b border-amber-100 hover:bg-amber-50/50">
                    <td className="px-4 py-3 font-semibold text-slate-900">{m.name}</td>
                    <td className="px-4 py-3 text-slate-500">{m.code}</td>
                    <td className="px-4 py-3 text-center text-slate-700">{m.stockCurrent}</td>
                    <td className="px-4 py-3 text-center text-amber-600 font-medium">{m.pendingQty}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-bold ${m.availableQty <= 0 ? 'text-red-600' : 'text-amber-600'}`}>
                        {m.availableQty}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600">{m.stockMinimum}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant="warning" className="text-sm font-bold px-3 py-1">
                        {suggestedOrder(m)} un.
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <CardContent className="pt-4">
            <p className="text-xs text-slate-400">
              * Sugestão calculada como: (estoque mínimo × 2) − disponível real. Ajuste conforme necessidade.
            </p>
          </CardContent>
        </Card>
      )}

      {ok.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Estoque OK
            </CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Material</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600">Disponível</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600">Mínimo</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600">Folga</th>
                </tr>
              </thead>
              <tbody>
                {ok.map(m => (
                  <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-900">{m.name} <span className="text-slate-400 text-xs">({m.code})</span></td>
                    <td className="px-4 py-3 text-center font-semibold text-green-700">{m.availableQty}</td>
                    <td className="px-4 py-3 text-center text-slate-500">{m.stockMinimum}</td>
                    <td className="px-4 py-3 text-center text-slate-500">+{m.availableQty - m.stockMinimum}</td>
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
