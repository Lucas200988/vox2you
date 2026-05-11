import { getSales } from '@/actions/sales'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ShoppingCart, Plus, School, Building2 } from 'lucide-react'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'

const statusConfig = {
  pendente:  { label: 'Pendente',  variant: 'warning' as const },
  entregue:  { label: 'Entregue',  variant: 'success' as const },
  cancelado: { label: 'Cancelado', variant: 'destructive' as const },
}

const courseColors: Record<string, string> = {
  MASTER:     'bg-purple-100 text-purple-700',
  ACADEMY:    'bg-blue-100 text-blue-700',
  INTENSIVOX: 'bg-orange-100 text-orange-700',
}

export default async function SalesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const dbUser = await prisma.user.findUnique({ where: { email: user!.email! } })

  const sellerId = dbUser?.role === 'vendedor' ? dbUser.id : undefined
  const sales = await getSales(sellerId)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Vendas</h1>
          <p className="text-slate-500 mt-1">{sales.length} venda{sales.length !== 1 ? 's' : ''} registrada{sales.length !== 1 ? 's' : ''}</p>
        </div>
        <Link
          href="/sales/new"
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Lançar Venda
        </Link>
      </div>

      {sales.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ShoppingCart className="h-12 w-12 text-slate-300 mb-4" />
            <p className="text-slate-600 font-medium">Nenhuma venda registrada</p>
            <p className="text-slate-400 text-sm mt-1">Lance a primeira venda para começar.</p>
            <Link href="/sales/new" className="mt-4 text-blue-600 text-sm font-medium hover:underline">
              Lançar venda
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sales.map(sale => {
            const st = statusConfig[sale.status]
            const isFranqueadora = (sale as any).saleType === 'franqueadora'
            return (
              <Card key={sale.id}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="font-semibold text-slate-900">{sale.studentName}</p>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${courseColors[sale.course] ?? 'bg-slate-100 text-slate-700'}`}>
                          {sale.course}
                        </span>
                        <Badge variant={st.variant}>{st.label}</Badge>
                        {isFranqueadora ? (
                          <span className="flex items-center gap-1 text-xs text-purple-600 font-medium">
                            <Building2 className="h-3 w-3" /> Franqueadora
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-blue-600 font-medium">
                            <School className="h-3 w-3" /> Escola
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500">
                        {formatDate(sale.saleDate)} · Vendedor: {sale.seller.name}
                      </p>
                      {sale.studentPhone && (
                        <p className="text-sm text-slate-400 mt-0.5">{sale.studentPhone}</p>
                      )}
                      {sale.notes && (
                        <p className="mt-2 text-xs text-slate-500 bg-slate-50 rounded px-2 py-1.5">{sale.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {sale.items.map(item => (
                        <Badge key={item.id} variant={
                          item.status === 'entregue' ? 'success' :
                          item.status === 'cancelado' ? 'secondary' : 'warning'
                        }>
                          {item.status === 'entregue' ? 'Entregue' :
                           item.status === 'cancelado' ? 'Cancelado' : 'Pendente'}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
