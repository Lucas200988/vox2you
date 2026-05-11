'use server'

import { prisma } from '@/lib/prisma'
import { getAuthUser } from './auth'
import { revalidatePath } from 'next/cache'

export async function getPendingDeliveries() {
  return prisma.saleItem.findMany({
    where: { status: 'pendente' },
    include: {
      sale: {
        include: { seller: { select: { name: true } } },
      },
      material: true,
    },
    orderBy: { sale: { createdAt: 'asc' } },
  })
}

export async function confirmDelivery(saleItemId: string, notes?: string) {
  const user = await getAuthUser()
  if (user.role === 'vendedor') throw new Error('Sem permissão')

  const saleItem = await prisma.saleItem.findUnique({
    where: { id: saleItemId },
    include: {
      material: true,
      sale: { include: { items: true } },
    },
  })

  if (!saleItem) return { error: 'Item não encontrado.' }
  if (saleItem.status !== 'pendente') return { error: 'Este item já foi entregue ou cancelado.' }

  const material = saleItem.material
  const pendingForThisItem = saleItem.quantity

  const pendingOthers = await prisma.saleItem.aggregate({
    where: {
      materialId: material.id,
      status: 'pendente',
      id: { not: saleItemId },
    },
    _sum: { quantity: true },
  })

  const totalPending = (pendingOthers._sum.quantity ?? 0) + pendingForThisItem
  const available = material.stockCurrent - (totalPending - pendingForThisItem)

  if (available < pendingForThisItem) {
    return { error: `Estoque insuficiente. Disponível: ${available}, necessário: ${pendingForThisItem}.` }
  }

  await prisma.$transaction(async tx => {
    await tx.saleItem.update({
      where: { id: saleItemId },
      data: { status: 'entregue' },
    })

    await tx.delivery.create({
      data: {
        saleItemId,
        deliveredById: user.id,
        notes,
      },
    })

    await tx.material.update({
      where: { id: material.id },
      data: { stockCurrent: { decrement: pendingForThisItem } },
    })

    await tx.stockMovement.create({
      data: {
        type: 'entrega',
        materialId: material.id,
        quantity: -pendingForThisItem,
        saleId: saleItem.saleId,
        userId: user.id,
        notes: notes ?? `Entrega para ${saleItem.sale.studentName}`,
      },
    })

    // Se todos os itens da venda foram entregues, atualiza status da venda
    const allItems = await tx.saleItem.findMany({
      where: { saleId: saleItem.saleId },
    })
    const allDelivered = allItems.every(i => i.status === 'entregue' || i.id === saleItemId)
    if (allDelivered) {
      await tx.sale.update({
        where: { id: saleItem.saleId },
        data: { status: 'entregue' },
      })
    }
  })

  revalidatePath('/pending-deliveries')
  revalidatePath('/materials')
  revalidatePath('/dashboard')
  return { success: true }
}
