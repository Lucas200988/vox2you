import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import type { BotIntent } from './processor'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

export async function handleIntent(intent: BotIntent, botUserId: string): Promise<string> {
  switch (intent.action) {
    case 'launch_sale': {
      const items = await Promise.all(
        intent.items.map(async (item) => {
          const material = await prisma.material.findFirst({
            where: { name: { contains: item.materialName, mode: 'insensitive' }, active: true },
          })
          if (!material) throw new Error(`Material "${item.materialName}" não encontrado`)
          return { materialId: material.id, quantity: item.quantity, name: material.name }
        })
      )

      const sale = await prisma.$transaction(async (tx) => {
        const s = await tx.sale.create({
          data: {
            studentName: intent.studentName,
            course: intent.course,
            saleType: intent.saleType,
            sellerId: botUserId,
            saleDate: new Date(),
            status: 'pendente',
            items: {
              create: items.map((i) => ({
                materialId: i.materialId,
                quantity: i.quantity,
                status: 'pendente',
              })),
            },
          },
        })

        for (const item of items) {
          await tx.stockMovement.create({
            data: {
              type: 'venda_lancada',
              materialId: item.materialId,
              quantity: -item.quantity,
              saleId: s.id,
              userId: botUserId,
              notes: `Venda via WhatsApp para ${intent.studentName}`,
            },
          })
        }

        return s
      })

      const itemsText = items.map((i) => `${i.quantity}x ${i.name}`).join(', ')
      const canal = intent.saleType === 'escola' ? 'Escola' : 'Franqueadora'
      return `✅ Venda lançada!\n👤 Aluno: ${intent.studentName}\n📚 Curso: ${intent.course}\n📦 Itens: ${itemsText}\n🏪 Canal: ${canal}`
    }

    case 'confirm_delivery': {
      const pendingItems = await prisma.saleItem.findMany({
        where: {
          status: 'pendente',
          sale: { studentName: { contains: intent.studentName, mode: 'insensitive' } },
        },
        include: { sale: true, material: true },
      })

      if (pendingItems.length === 0) {
        return `❌ Nenhuma entrega pendente para "${intent.studentName}"`
      }

      for (const item of pendingItems) {
        await prisma.$transaction(async (tx) => {
          await tx.saleItem.update({ where: { id: item.id }, data: { status: 'entregue' } })
          await tx.delivery.create({ data: { saleItemId: item.id, deliveredById: botUserId } })
          await tx.material.update({
            where: { id: item.materialId },
            data: { stockCurrent: { decrement: item.quantity } },
          })
          await tx.stockMovement.create({
            data: {
              type: 'entrega',
              materialId: item.materialId,
              quantity: -item.quantity,
              saleId: item.saleId,
              userId: botUserId,
              notes: `Entrega via WhatsApp para ${item.sale.studentName}`,
            },
          })
        })
      }

      const saleIds = [...new Set(pendingItems.map((i) => i.saleId))]
      for (const saleId of saleIds) {
        const allItems = await prisma.saleItem.findMany({ where: { saleId } })
        if (allItems.every((i) => i.status === 'entregue')) {
          await prisma.sale.update({ where: { id: saleId }, data: { status: 'entregue' } })
        }
      }

      return `✅ ${pendingItems.length} item(s) entregue(s) para ${intent.studentName}!`
    }

    case 'cancel_sale': {
      const sale = await prisma.sale.findFirst({
        where: {
          status: 'pendente',
          studentName: { contains: intent.studentName, mode: 'insensitive' },
        },
        include: { items: true },
      })
      if (!sale) return `❌ Nenhuma venda pendente para "${intent.studentName}"`

      await prisma.$transaction(async (tx) => {
        await tx.sale.update({ where: { id: sale.id }, data: { status: 'cancelado' } })
        await tx.saleItem.updateMany({
          where: { saleId: sale.id, status: 'pendente' },
          data: { status: 'cancelado' },
        })
        for (const item of sale.items.filter((i) => i.status === 'pendente')) {
          await tx.stockMovement.create({
            data: {
              type: 'cancelamento',
              materialId: item.materialId,
              quantity: item.quantity,
              saleId: sale.id,
              userId: botUserId,
              notes: 'Cancelamento via WhatsApp',
            },
          })
        }
      })

      return `✅ Venda de ${intent.studentName} cancelada!`
    }

    case 'stock_entry': {
      const material = await prisma.material.findFirst({
        where: { name: { contains: intent.materialName, mode: 'insensitive' }, active: true },
      })
      if (!material) return `❌ Material "${intent.materialName}" não encontrado`

      await prisma.$transaction(async (tx) => {
        await tx.stockEntry.create({
          data: {
            materialId: material.id,
            quantity: intent.quantity,
            entryDate: new Date(),
            responsibleId: botUserId,
            notes: intent.notes,
          },
        })
        await tx.material.update({
          where: { id: material.id },
          data: { stockCurrent: { increment: intent.quantity } },
        })
        await tx.stockMovement.create({
          data: {
            type: 'entrada',
            materialId: material.id,
            quantity: intent.quantity,
            userId: botUserId,
            notes: intent.notes ?? 'Entrada via WhatsApp',
          },
        })
      })

      const updated = await prisma.material.findUnique({ where: { id: material.id } })
      return `✅ Entrada registrada!\n📦 Material: ${material.name}\n➕ Qtd entrada: ${intent.quantity}\n📊 Estoque atual: ${updated!.stockCurrent}`
    }

    case 'create_purchase_order': {
      const material = await prisma.material.findFirst({
        where: { name: { contains: intent.materialName, mode: 'insensitive' }, active: true },
      })
      if (!material) return `❌ Material "${intent.materialName}" não encontrado`

      await prisma.$transaction(async (tx) => {
        await tx.purchaseOrder.create({
          data: {
            materialId: material.id,
            quantity: intent.quantity,
            orderDate: new Date(),
            responsibleId: botUserId,
            notes: intent.notes,
            status: 'aguardando',
          },
        })
        await tx.stockMovement.create({
          data: {
            type: 'pedido_franqueadora',
            materialId: material.id,
            quantity: intent.quantity,
            userId: botUserId,
            notes: intent.notes ?? 'Pedido via WhatsApp',
          },
        })
      })

      return `✅ Pedido criado!\n📦 Material: ${material.name}\n🔢 Quantidade: ${intent.quantity}\n⏳ Status: Aguardando`
    }

    case 'receive_purchase_order': {
      const material = await prisma.material.findFirst({
        where: { name: { contains: intent.materialName, mode: 'insensitive' }, active: true },
      })
      if (!material) return `❌ Material "${intent.materialName}" não encontrado`

      const order = await prisma.purchaseOrder.findFirst({
        where: { materialId: material.id, status: 'aguardando' },
        orderBy: { createdAt: 'asc' },
      })
      if (!order) return `❌ Nenhum pedido pendente para "${intent.materialName}"`

      await prisma.$transaction(async (tx) => {
        await tx.purchaseOrder.update({
          where: { id: order.id },
          data: { status: 'recebido', receivedDate: new Date() },
        })
        await tx.material.update({
          where: { id: material.id },
          data: { stockCurrent: { increment: order.quantity } },
        })
        await tx.stockMovement.create({
          data: {
            type: 'entrada',
            materialId: material.id,
            quantity: order.quantity,
            userId: botUserId,
            notes: 'Recebimento via WhatsApp',
          },
        })
      })

      const updated = await prisma.material.findUnique({ where: { id: material.id } })
      return `✅ Pedido recebido!\n📦 Material: ${material.name}\n➕ Qtd recebida: ${order.quantity}\n📊 Estoque atual: ${updated!.stockCurrent}`
    }

    case 'unknown':
      return [
        '🤔 Não entendi: ' + intent.reason,
        '',
        '*Comandos disponíveis:*',
        '• "venda pro [nome], [curso], [qtd] [material]"',
        '• "venda franqueadora pro [nome], [curso], [qtd] [material]"',
        '• "entregue pro [nome]"',
        '• "cancelar venda do [nome]"',
        '• "entrada de [qtd] [material]"',
        '• "pedido [qtd] [material] pra franqueadora"',
        '• "chegou pedido de [material]"',
      ].join('\n')
  }
}
