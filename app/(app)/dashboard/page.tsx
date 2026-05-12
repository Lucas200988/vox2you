import { getDashboardStats } from '@/actions/dashboard'
import { getMaterialsWithStock } from '@/actions/materials'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Truck, CheckCircle, AlertTriangle, Users, ShoppingCart, Package } from 'lucide-react'
import Link from 'next/link'
import { DashboardRefresher } from '@/components/dashboard-refresher'

const PRODUCTS = ['MASTER', 'ACADEMY', 'INTENSIVOX']

const productColors: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  MASTER:     { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', badge: 'bg-purple-100 text-purple-800' },
  ACADEMY:    { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   badge: 'bg-blue-100 text-blue-800' },
  INTENSIVOX: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-800' },
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const dbUser = await prisma.user.findUnique({ where: { email: user!.email! } })

  const [stats, materials] = await Promise.all([
    getDashboardStats(),
    getMaterialsWithStock(),
  ])

  const productMaterials = PRODUCTS.map(name => {
    const m = materials.find(mat => mat.name === name)
    return {
      name,
      stockCurrent: m?.stockCurrent ?? 0,
      pendingQty: m?.pendingQty ?? 0,
      availableQty: m?.availableQty ?? 0,
      stockMinimum: m?.stockMinimum ?? 5,
      needsReplenishment: m?.needsReplenishment ?? true,
    }
  })

  const lowStock = productMaterials.filter(m => m.needsReplenishment)

  return (
    <div className="space-y-6">
      <DashboardRefresher />
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Olá, {dbUser?.name?.split(' ')[0]} 👋
        </h1>
        <p className="text-slate-500 mt-1">Aqui está o resumo do estoque hoje.</p>
      </div>

      {lowStock.length > 0 && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Estoque baixo</AlertTitle>
          <AlertDescription>
            {lowStock.map(m => m.name).join(', ')} {lowStock.length === 1 ? 'está' : 'estão'} abaixo do mínimo.{' '}
            <Link href="/replenishment" className="font-semibold underline">Ver reposição</Link>
          </AlertDescription>
        </Alert>
      )}

      {/* 3 cards dos produtos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {productMaterials.map(m => {
          const colors = productColors[m.name]
          return (
            <Card key={m.name} className={`border-2 ${m.needsReplenishment ? 'border-red-300' : colors.border}`}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className={`text-lg font-bold ${colors.text}`}>{m.name}</span>
                  {m.needsReplenishment
                    ? <Badge variant="warning"><AlertTriangle className="h-3 w-3 mr-1" />Repor</Badge>
                    : <Badge variant="success">OK</Badge>
                  }
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-slate-100">
                    <span className="text-sm text-slate-500">Em estoque</span>
                    <span className="text-xl font-bold text-slate-900">{m.stockCurrent}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-100">
                    <span className="text-sm text-slate-500">Pendente entrega</span>
                    <span className="text-xl font-bold text-amber-600">{m.pendingQty}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-slate-500">Disponível real</span>
                    <span className={`text-xl font-bold ${m.availableQty <= m.stockMinimum ? 'text-red-600' : 'text-green-600'}`}>
                      {m.availableQty}
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center">
                  <span className="text-xs text-slate-400">Mínimo: {m.stockMinimum}</span>
                  <Link
                    href="/stock-entries/new"
                    className={`text-xs font-semibold ${colors.text} hover:underline`}
                  >
                    + Entrada
                  </Link>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-9 w-9 rounded-lg bg-amber-50 flex items-center justify-center">
                <Truck className="h-5 w-5 text-amber-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900">{stats.pendingItems}</p>
            <p className="text-sm text-slate-600 mt-0.5">Pendentes de entrega</p>
            <Link href="/pending-deliveries" className="text-xs text-amber-600 hover:underline mt-1 block">Ver todos</Link>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-9 w-9 rounded-lg bg-green-50 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900">{stats.deliveredThisMonth}</p>
            <p className="text-sm text-slate-600 mt-0.5">Entregues este mês</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900">
              {stats.sellerStats.reduce((s, v) => s + v.salesCount, 0)}
            </p>
            <p className="text-sm text-slate-600 mt-0.5">Vendas este mês</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-9 w-9 rounded-lg bg-red-50 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900">{stats.lowStockCount}</p>
            <p className="text-sm text-slate-600 mt-0.5">Produtos abaixo do mínimo</p>
            <Link href="/replenishment" className="text-xs text-red-500 hover:underline mt-1 block">Ver reposição</Link>
          </CardContent>
        </Card>
      </div>

      {/* Vendas por vendedor + Ações rápidas */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-5 w-5 text-blue-600" />
              Vendas por Vendedor (este mês)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.sellerStats.filter(s => s.salesCount > 0).length === 0 ? (
              <p className="text-slate-400 text-sm py-4 text-center">Nenhuma venda registrada este mês.</p>
            ) : (
              <div className="space-y-3">
                {stats.sellerStats
                  .filter(s => s.salesCount > 0)
                  .sort((a, b) => b.salesCount - a.salesCount)
                  .map(s => (
                    <div key={s.name} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
                      <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm flex-shrink-0">
                        {s.name.charAt(0)}
                      </div>
                      <span className="flex-1 text-sm font-medium text-slate-900">{s.name}</span>
                      <Badge variant="default">{s.salesCount} {s.salesCount === 1 ? 'venda' : 'vendas'}</Badge>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ações Rápidas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link href="/sales/new" className="flex items-center gap-3 rounded-xl bg-blue-600 px-4 py-3.5 text-white hover:bg-blue-700 transition-colors">
              <ShoppingCart className="h-5 w-5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-sm">Lançar Venda</p>
                <p className="text-xs text-blue-200">Registrar nova venda de curso</p>
              </div>
            </Link>
            <Link href="/pending-deliveries" className="flex items-center gap-3 rounded-xl bg-amber-500 px-4 py-3.5 text-white hover:bg-amber-600 transition-colors">
              <Truck className="h-5 w-5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-sm">Confirmar Entregas</p>
                <p className="text-xs text-amber-100">{stats.pendingItems} pendente{stats.pendingItems !== 1 ? 's' : ''}</p>
              </div>
            </Link>
            <Link href="/stock-entries/new" className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-slate-700 hover:bg-slate-50 transition-colors">
              <Package className="h-5 w-5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-sm">Entrada de Estoque</p>
                <p className="text-xs text-slate-400">Receber novos materiais</p>
              </div>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
