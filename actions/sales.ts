'use server'

import { prisma } from '@/lib/prisma'
import { getAuthUser } from './auth'
import { notifyGroup } from '@/lib/notify'
import { revalidatePath } from 'next/cache'

export interface SaleItemInput {
  materialId: string
  quantity: number
}

export async function createSale(data: {
  studentName: string
  studentPhone?: string
  course: string
  saleType: 'escola' | 'franqueadora'
  saleDate: string
  notes?: string
  items: SaleItemInput[]
}) {
  const user = await getAuthUser()

  if (!data.items || data.items.length === 0) {
    return { error: 'Adicione ao menos um material à venda.' }
  }

  await prisma.$transaction(async tx => {
    const sale = await tx.sale.create({
      data: {
        studentName: data.studentName,
        studentPhone: data.studentPhone,
        course: data.course,
        saleType: data.saleType,
        sellerId: user.id,
        saleDate: new Date(data.saleDate),
        status: 'pendente',
        notes: data.notes,
        items: {
          create: data.items.map(item => ({
            materialId: item.materialId,
            quantity: item.quantity,
            status: 'pendente',
          })),
        },
      },
    })

    for (const item of data.items) {
      await tx.stockMovement.create({
        data: {
          type: 'venda_lancada',
          materialId: item.materialId,
          quantity: -item.quantity,
          saleId: sale.id,
          userId: user.id,
          notes: `Venda para ${data.studentName}`,
        },
      })
    }
  })

  revalidatePath('/sales')
  revalidatePath('/pending-deliveries')
  revalidatePath('/dashboard')

  const materials = await prisma.material.findMany({
    where: { id: { in: data.items.map(i => i.materialId) } },
    select: { id: true, name: true },
  })
  const nameById = Object.fromEntries(materials.map(m => [m.id, m.name]))
  const itemsText = data.items.map(i => `${i.quantity}x ${nameById[i.materialId] ?? i.materialId}`).join(', ')
  const canal = data.saleType === 'escola' ? 'Escola' : 'Franqueadora'
  notifyGroup(`🖥️ *${user.name}* lançou uma venda pelo sistema\n👤 ${data.studentName} — ${data.course} (${canal})\n📦 ${itemsText}`)

  return { success: true }
}

export async function getSales(sellerId?: string) {
  return prisma.sale.findMany({
    where: sellerId ? { sellerId } : undefined,
    include: {
      seller: { select: { name: true } },
      items: {
        include: { material: { select: { name: true, code: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function cancelSale(saleId: string) {
  const user = await getAuthUser()
  if (user.role === 'vendedor') throw new Error('Sem permissão')

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: { items: true },
  })

  if (!sale) return { error: 'Venda não encontrada.' }
  if (sale.status === 'entregue') return { error: 'Não é possível cancelar uma venda já entregue.' }
  if (sale.status === 'cancelado') return { error: 'Venda já cancelada.' }

  await prisma.$transaction(async tx => {
    await tx.sale.update({
      where: { id: saleId },
      data: { status: 'cancelado' },
    })

    await tx.saleItem.updateMany({
      where: { saleId, status: 'pendente' },
      data: { status: 'cancelado' },
    })

    for (const item of sale.items.filter(i => i.status === 'pendente')) {
      await tx.stockMovement.create({
        data: {
          type: 'cancelamento',
          materialId: item.materialId,
          quantity: item.quantity,
          saleId,
          userId: user.id,
          notes: `Cancelamento de venda`,
        },
      })
    }
  })

  revalidatePath('/sales')
  revalidatePath('/pending-deliveries')
  revalidatePath('/dashboard')

  notifyGroup(`🖥️ *${user.name}* cancelou a venda de *${sale.studentName}* pelo sistema`)

  return { success: true }
}
