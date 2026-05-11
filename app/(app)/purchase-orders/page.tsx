import { getPurchaseOrders } from '@/actions/purchase-orders'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ClipboardList, Plus } from 'lucide-react'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import { ReceiveOrderButton } from './receive-button'
import { CancelOrderButton } from './cancel-button'

const statusConfig = {
  aguardando: { label: 'Aguardando', variant: 'warning' as const },
  recebido:   { label: 'Recebido',   variant: 'success' as const },
  cancelado:  { label: 'Cancelado',  variant: 'secondary' as const },
}

const productColors: Record<string, string> = {
  MASTER:     'bg-purple-100 text-purple-700',
  ACADEMY:    'bg-blue-100 text-blue-700',
  INTENSIVOX: 'bg-orange-100 text-orange-700',
}

export default async function PurchaseOrdersPage() {
  const orders = await getPurchaseOrders()
  const pending = orders.filter(o => o.status === 'aguardando')
  const done = orders.filter(o => o.status !== 'aguardando')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pedidos à Franqueadora</h1>
          <p className="text-slate-500 mt-1">
            {pending.length} pedido{pending.length !== 1 ? 's' : ''} aguardando recebimento
          </p>
        </div>
        <Link
          href="/purchase-orders/new"
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Novo Pedido
        </Link>
      </div>

      {orders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ClipboardList className="h-12 w-12 text-slate-300 mb-4" />
            <p className="text-slate-600 font-medium">Nenhum pedido registrado</p>
            <p className="text-slate-400 text-sm mt-1">Registre o primeiro pedido à franqueadora.</p>
            <Link href="/purchase-orders/new" className="mt-4 text-blue-600 text-sm font-medium hover:underline">
              Fazer pedido
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Aguardando */}
          {pending.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Aguardando recebimento</h2>
              {pending.map(order => (
                <Card key={order.id} className="border-amber-200">
                  <CardContent className="p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${productColors[order.material.name] ?? 'bg-slate-100 text-slate-700'}`}>
                            {order.material.name}
                          </span>
                          <Badge variant={statusConfig[order.status].variant}>
                            {statusConfig[order.status].label}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-600 mt-1">
                          <strong>{order.quantity} unidade{order.quantity !== 1 ? 's' : ''}</strong> pedida{order.quantity !== 1 ? 's' : ''}
                          {' '}em {formatDate(order.orderDate)}
                        </p>
                        {order.expectedDate && (
                          <p className="text-sm text-slate-400">
                            Previsão de chegada: {formatDate(order.expectedDate)}
                          </p>
                        )}
                        <p className="text-xs text-slate-400 mt-1">Responsável: {order.responsible.name}</p>
                        {order.notes && (
                          <p className="text-xs text-slate-500 bg-slate-50 rounded px-2 py-1 mt-2">{order.notes}</p>
                        )}
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <ReceiveOrderButton orderId={order.id} materialName={order.material.name} quantity={order.quantity} />
                        <CancelOrderButton orderId={order.id} materialName={order.material.name} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Histórico */}
          {done.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Histórico</h2>
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="text-left px-4 py-3 font-semibold text-slate-600">Produto</th>
                        <th className="text-center px-4 py-3 font-semibold text-slate-600">Qtd</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600">Pedido em</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600">Recebido em</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {done.map(order => (
                        <tr key={order.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${productColors[order.material.name] ?? 'bg-slate-100 text-slate-700'}`}>
                              {order.material.name}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center font-semibold">{order.quantity}</td>
                          <td className="px-4 py-3 text-slate-600">{formatDate(order.orderDate)}</td>
                          <td className="px-4 py-3 text-slate-600">{order.receivedDate ? formatDate(order.receivedDate) : '—'}</td>
                          <td className="px-4 py-3">
                            <Badge variant={statusConfig[order.status].variant}>{statusConfig[order.status].label}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
