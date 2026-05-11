'use server'

import { prisma } from '@/lib/prisma'

export async function getHistory(filters?: {
  type?: string
  materialId?: string
  userId?: string
  from?: string
  to?: string
}) {
  return prisma.stockMovement.findMany({
    where: {
      type: filters?.type ? (filters.type as any) : undefined,
      materialId: filters?.materialId || undefined,
      userId: filters?.userId || undefined,
      createdAt: {
        gte: filters?.from ? new Date(filters.from) : undefined,
        lte: filters?.to ? new Date(filters.to + 'T23:59:59') : undefined,
      },
    },
    include: {
      material: { select: { name: true, code: true } },
      user: { select: { name: true, role: true } },
      sale: { select: { studentName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })
}
