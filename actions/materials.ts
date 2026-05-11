'use server'

import { prisma } from '@/lib/prisma'
import { getAuthUser } from './auth'
import { revalidatePath } from 'next/cache'

export async function getMaterials() {
  return prisma.material.findMany({
    orderBy: { name: 'asc' },
  })
}

export async function getMaterial(id: string) {
  return prisma.material.findUnique({ where: { id } })
}

export async function createMaterial(data: {
  name: string
  code: string
  type: string
  stockMinimum: number
  notes?: string
}) {
  const user = await getAuthUser()
  if (user.role === 'vendedor') throw new Error('Sem permissão')

  const existing = await prisma.material.findUnique({ where: { code: data.code } })
  if (existing) return { error: 'Já existe um material com este código.' }

  await prisma.material.create({
    data: {
      name: data.name,
      code: data.code.toUpperCase(),
      type: data.type,
      stockMinimum: data.stockMinimum,
      notes: data.notes,
      stockCurrent: 0,
    },
  })

  revalidatePath('/materials')
  return { success: true }
}

export async function updateMaterial(id: string, data: {
  name: string
  code: string
  type: string
  stockMinimum: number
  active: boolean
  notes?: string
}) {
  const user = await getAuthUser()
  if (user.role !== 'gestor') throw new Error('Sem permissão')

  await prisma.material.update({
    where: { id },
    data: {
      name: data.name,
      code: data.code.toUpperCase(),
      type: data.type,
      stockMinimum: data.stockMinimum,
      active: data.active,
      notes: data.notes,
    },
  })

  revalidatePath('/materials')
  return { success: true }
}

export async function getMaterialsWithStock() {
  const materials = await prisma.material.findMany({
    where: { active: true },
    include: {
      saleItems: {
        where: { status: 'pendente' },
        select: { quantity: true },
      },
    },
    orderBy: { name: 'asc' },
  })

  return materials.map(m => {
    const pendingQty = m.saleItems.reduce((sum, item) => sum + item.quantity, 0)
    const availableQty = m.stockCurrent - pendingQty
    return {
      ...m,
      pendingQty,
      availableQty,
      needsReplenishment: availableQty <= m.stockMinimum,
    }
  })
}
