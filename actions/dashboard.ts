'use server'

import { prisma } from '@/lib/prisma'

export async function getDashboardStats() {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const [
    totalMaterials,
    pendingItems,
    deliveredThisMonth,
    materialsData,
    sellerStats,
  ] = await Promise.all([
    prisma.material.count({ where: { active: true } }),
    prisma.saleItem.count({ where: { status: 'pendente' } }),
    prisma.saleItem.count({
      where: { status: 'entregue', delivery: { deliveryDate: { gte: startOfMonth } } },
    }),
    prisma.material.findMany({
      where: { active: true },
      include: {
        saleItems: { where: { status: 'pendente' }, select: { quantity: true } },
      },
    }),
    prisma.user.findMany({
      where: { role: 'vendedor', active: true },
      include: {
        sales: {
          where: { createdAt: { gte: startOfMonth } },
          select: { id: true },
        },
      },
    }),
  ])

  const lowStockCount = materialsData.filter(m => {
    const pending = m.saleItems.reduce((s, i) => s + i.quantity, 0)
    return (m.stockCurrent - pending) <= m.stockMinimum
  }).length

  const totalStockUnits = materialsData.reduce((s, m) => s + m.stockCurrent, 0)

  return {
    totalMaterials,
    totalStockUnits,
    pendingItems,
    deliveredThisMonth,
    lowStockCount,
    sellerStats: sellerStats.map(s => ({
      name: s.name,
      salesCount: s.sales.length,
    })),
  }
}
