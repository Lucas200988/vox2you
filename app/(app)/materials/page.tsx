import { getMaterialsWithStock } from '@/actions/materials'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle, Package } from 'lucide-react'
import Link from 'next/link'

const PRODUCTS = ['MASTER', 'ACADEMY', 'INTENSIVOX']

const productColors: Record<string, { icon: string; border: string; title: string }> = {
  MASTER:     { icon: 'bg-purple-100 text-purple-700', border: 'border-purple-200', title: 'text-purple-700' },
  ACADEMY:    { icon: 'bg-blue-100 text-blue-700',     border: 'border-blue-200',   title: 'text-blue-700' },
  INTENSIVOX: { icon: 'bg-orange-100 text-orange-700', border: 'border-orange-200', title: 'text-orange-700' },
}

export default async function MaterialsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const dbUser = await prisma.user.findUnique({ where: { email: user!.email! } })

  const materials = await getMaterialsWithStock()
  const canEdit = dbUser?.role === 'gestor'

  const productMaterials = PRODUCTS.map(name => ({
    name,
    data: materials.find(m => m.name === name),
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Materiais</h1>
          <p className="text-slate-500 mt-1">Estoque dos 3 kits de curso</p>
        </div>
        {canEdit && (
          <Link
            href="/stock-entries/new"
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <Package className="h-4 w-4" />
            Entrada de Estoque
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {productMaterials.map(({ name, data }) => {
          const colors = productColors[name]
          const stock = data?.stockCurrent ?? 0
          const pending = data?.pendingQty ?? 0
          const available = data?.availableQty ?? 0
          const minimum = data?.stockMinimum ?? 5
          const needsReplenishment = data?.needsReplenishment ?? true

          return (
            <Card key={name} className={`border-2 ${needsReplenishment ? 'border-red-300' : colors.border}`}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${colors.icon}`}>
                      <Package className="h-5 w-5" />
                    </div>
                    <span className={`text-lg font-bold ${colors.title}`}>{name}</span>
                  </div>
                  {needsReplenishment
                    ? <Badge variant="warning"><AlertTriangle className="h-3 w-3 mr-1" />Repor</Badge>
                    : <Badge variant="success">OK</Badge>
                  }
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-0">
                <div className="divide-y divide-slate-100">
                  <div className="flex justify-between items-center py-3">
                    <span className="text-sm text-slate-500">Em estoque</span>
                    <span className="text-2xl font-bold text-slate-900">{stock}</span>
                  </div>
                  <div className="flex justify-between items-center py-3">
                    <span className="text-sm text-slate-500">Pendente de entrega</span>
                    <span className="text-2xl font-bold text-amber-500">{pending}</span>
                  </div>
                  <div className="flex justify-between items-center py-3">
                    <span className="text-sm font-medium text-slate-700">Disponível real</span>
                    <span className={`text-2xl font-bold ${available <= minimum ? 'text-red-600' : 'text-green-600'}`}>
                      {available}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 mt-2 border-t border-slate-100">
                  <span className="text-xs text-slate-400">Estoque mínimo: {minimum}</span>
                  {canEdit && data && (
                    <Link
                      href={`/materials/${data.id}/edit`}
                      className="text-xs font-medium text-slate-500 hover:text-slate-800 hover:underline"
                    >
                      Ajustar mínimo
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Fórmula explicativa */}
      <Card className="bg-slate-50 border-slate-200">
        <CardContent className="p-4">
          <p className="text-xs text-slate-500 text-center">
            <strong>Disponível real</strong> = Em estoque − Pendente de entrega
            &nbsp;·&nbsp;
            Alerta ativado quando disponível real ≤ estoque mínimo
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
