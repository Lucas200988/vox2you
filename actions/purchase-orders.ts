'use server'

import { prisma } from '@/lib/prisma'
import { getAuthUser } from './auth'
import { notifyGroup } from '@/lib/notify'
import { revalidatePath } from 'next/cache'

export async function getPurchaseOrders() {
  return prisma.purchaseOrder.findMany({
    include: {
      material: { select: { name: true, code: true } },
      responsible: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function createPurchaseOrder(data: {
  materialId: string
  quantity: number
  orderDate: string
  expectedDate?: string
  notes?: string
}) {
  const user = await getAuthUser()
  if (user.role === 'vendedor') throw new Error('Sem permissão')

  await prisma.$transaction(async tx => {
    await tx.purchaseOrder.create({
      data: {
        materialId: data.materialId,
        quantity: data.quantity,
        orderDate: new Date(data.orderDate),
        expectedDate: data.expectedDate ? new Date(data.expectedDate) : null,
        responsibleId: user.id,
        notes: data.notes,
        status: 'aguardando',
      },
    })

    await tx.stockMovement.create({
      data: {
        type: 'pedido_franqueadora',
        materialId: data.materialId,
        quantity: data.quantity,
        userId: user.id,
        notes: data.notes ?? `Pedido à franqueadora`,
      },
    })
  })

  revalidatePath('/purchase-orders')
  revalidatePath('/dashboard')

  const material = await prisma.material.findUnique({ where: { id: data.materialId }, select: { name: true } })
  notifyGroup(`🖥️ *${user.name}* criou um pedido à franqueadora pelo sistema\n📋 ${data.quantity}x ${material?.name ?? data.materialId}`)

  return { success: true }
}

export async function receivePurchaseOrder(id: string, notes?: string) {
  const user = await getAuthUser()
  if (user.role === 'vendedor') throw new Error('Sem permissão')

  const order = await prisma.purchaseOrder.findUnique({ where: { id } })
  if (!order) return { error: 'Pedido não encontrado.' }
  if (order.status !== 'aguardando') return { error: 'Pedido já foi recebido ou cancelado.' }

  await prisma.$transaction(async tx => {
    await tx.purchaseOrder.update({
      where: { id },
      data: { status: 'recebido', receivedDate: new Date() },
    })

    await tx.material.update({
      where: { id: order.materialId },
      data: { stockCurrent: { increment: order.quantity } },
    })

    await tx.stockMovement.create({
      data: {
        type: 'entrada',
        materialId: order.materialId,
        quantity: order.quantity,
        userId: user.id,
        notes: notes ?? `Recebimento de pedido à franqueadora`,
      },
    })
  })

  revalidatePath('/purchase-orders')
  revalidatePath('/dashboard')
  revalidatePath('/materials')

  const material = await prisma.material.findUnique({ where: { id: order.materialId }, select: { name: true } })
  notifyGroup(`🖥️ *${user.name}* recebeu pedido da franqueadora pelo sistema\n📦 ${order.quantity}x ${material?.name ?? order.materialId} chegou ao estoque`)

  return { success: true }
}

export async function cancelPurchaseOrder(id: string) {
  const user = await getAuthUser()
  if (user.role === 'vendedor') throw new Error('Sem permissão')

  const order = await prisma.purchaseOrder.findUnique({ where: { id } })
  if (!order) return { error: 'Pedido não encontrado.' }
  if (order.status !== 'aguardando') return { error: 'Só é possível cancelar pedidos aguardando.' }

  await prisma.purchaseOrder.update({
    where: { id },
    data: { status: 'cancelado' },
  })

  revalidatePath('/purchase-orders')

  const material = await prisma.material.findUnique({ where: { id: order.materialId }, select: { name: true } })
  notifyGroup(`🖥️ *${user.name}* cancelou pedido à franqueadora pelo sistema\n📋 ${material?.name ?? order.materialId}`)

  return { success: true }
}
