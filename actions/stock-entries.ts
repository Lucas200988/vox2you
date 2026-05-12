'use server'

import { prisma } from '@/lib/prisma'
import { getAuthUser } from './auth'
import { notifyGroup } from '@/lib/notify'
import { revalidatePath } from 'next/cache'

export async function createStockEntry(data: {
  materialId: string
  quantity: number
  entryDate: string
  notes?: string
}) {
  const user = await getAuthUser()
  if (user.role === 'vendedor') throw new Error('Sem permissão')

  if (data.quantity <= 0) return { error: 'Quantidade deve ser maior que zero.' }

  await prisma.$transaction(async tx => {
    const entry = await tx.stockEntry.create({
      data: {
        materialId: data.materialId,
        quantity: data.quantity,
        entryDate: new Date(data.entryDate),
        responsibleId: user.id,
        notes: data.notes,
      },
    })

    await tx.material.update({
      where: { id: data.materialId },
      data: { stockCurrent: { increment: data.quantity } },
    })

    await tx.stockMovement.create({
      data: {
        type: 'entrada',
        materialId: data.materialId,
        quantity: data.quantity,
        userId: user.id,
        notes: data.notes ?? `Entrada de estoque`,
      },
    })

    return entry
  })

  revalidatePath('/stock-entries')
  revalidatePath('/materials')
  revalidatePath('/dashboard')

  const material = await prisma.material.findUnique({ where: { id: data.materialId }, select: { name: true } })
  notifyGroup(`🖥️ *${user.name}* registrou entrada de estoque pelo sistema\n📦 ${data.quantity}x ${material?.name ?? data.materialId}`)

  return { success: true }
}

export async function getStockEntries() {
  return prisma.stockEntry.findMany({
    include: {
      material: { select: { name: true, code: true } },
      responsible: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}
