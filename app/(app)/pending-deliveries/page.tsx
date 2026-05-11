import { getPendingDeliveries } from '@/actions/deliveries'
import { Card, CardContent } from '@/components/ui/card'
import { Truck } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { ConfirmDeliveryButton } from './confirm-button'

export default async function PendingDeliveriesPage() {
  const items = await getPendingDeliveries()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Entregas Pendentes</h1>
        <p className="text-slate-500 mt-1">
          {items.length === 0
            ? 'Nenhum material pendente de entrega'
            : `${items.length} item${items.length !== 1 ? 's' : ''} aguardando entrega`}
        </p>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <Truck className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-slate-600 font-semibold text-lg">Tudo entregue!</p>
            <p className="text-slate-400 text-sm mt-1">Não há materiais pendentes de entrega no momento.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <Card key={item.id}>
              <CardContent className="p-5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-slate-900">{item.sale.studentName}</p>
                      <span className="text-xs text-slate-400">#{item.saleId.slice(0, 8)}</span>
                    </div>
                    <p className="text-sm text-slate-600">{item.sale.course}</p>
                    <p className="text-sm text-slate-400 mt-0.5">
                      Vendido em {formatDate(item.sale.saleDate)} por {item.sale.seller.name}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <p className="text-sm font-medium text-slate-700">{item.material.name}</p>
                      <p className="text-xs text-slate-400">{item.material.code}</p>
                      <p className="text-lg font-bold text-amber-600">×{item.quantity}</p>
                    </div>

                    <div className="text-center text-xs text-slate-400">
                      <p>Em estoque</p>
                      <p className="text-lg font-bold text-slate-700">{item.material.stockCurrent}</p>
                    </div>

                    <ConfirmDeliveryButton saleItemId={item.id} studentName={item.sale.studentName} materialName={item.material.name} quantity={item.quantity} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
