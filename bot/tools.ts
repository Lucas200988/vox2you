import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import type Anthropic from '@anthropic-ai/sdk'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

// ─── Tool definitions (schemas para o Claude) ────────────────────────────────

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: 'launch_sale',
    description: `Lança uma venda no sistema. Existem dois fluxos:
1. saleType="escola": kit sai do estoque da escola → items obrigatório → admin entrega → sai do estoque.
2. saleType="franqueadora": aluno compra o kit direto no site da franqueadora → NÃO afeta o estoque → items não é necessário.
Sempre pergunte se o aluno vai receber o kit da escola ou vai comprar direto na franqueadora.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        studentName: { type: 'string', description: 'Nome completo do aluno' },
        course: { type: 'string', description: 'Nome do curso' },
        saleType: {
          type: 'string',
          enum: ['escola', 'franqueadora'],
          description: 'escola = kit do estoque da escola; franqueadora = aluno compra kit direto no site da franqueadora',
        },
        items: {
          type: 'array',
          description: 'Materiais da venda — obrigatório quando saleType="escola", omitir quando saleType="franqueadora"',
          items: {
            type: 'object',
            properties: {
              materialName: { type: 'string', description: 'Nome do material' },
              quantity: { type: 'number', description: 'Quantidade' },
            },
            required: ['materialName', 'quantity'],
          },
        },
      },
      required: ['studentName', 'course', 'saleType'],
    },
  },
  {
    name: 'confirm_delivery',
    description: 'Confirma a entrega de materiais para um aluno que tem venda pendente.',
    input_schema: {
      type: 'object' as const,
      properties: {
        studentName: { type: 'string', description: 'Nome do aluno' },
      },
      required: ['studentName'],
    },
  },
  {
    name: 'cancel_sale',
    description: 'Cancela uma venda pendente de um aluno.',
    input_schema: {
      type: 'object' as const,
      properties: {
        studentName: { type: 'string', description: 'Nome do aluno' },
      },
      required: ['studentName'],
    },
  },
  {
    name: 'stock_entry',
    description: 'Registra a entrada de materiais no estoque.',
    input_schema: {
      type: 'object' as const,
      properties: {
        materialName: { type: 'string', description: 'Nome do material' },
        quantity: { type: 'number', description: 'Quantidade que entrou' },
        notes: { type: 'string', description: 'Observações (opcional)' },
      },
      required: ['materialName', 'quantity'],
    },
  },
  {
    name: 'create_purchase_order',
    description: 'Cria um pedido de compra para a franqueadora.',
    input_schema: {
      type: 'object' as const,
      properties: {
        materialName: { type: 'string', description: 'Nome do material' },
        quantity: { type: 'number', description: 'Quantidade a pedir' },
        notes: { type: 'string', description: 'Observações (opcional)' },
      },
      required: ['materialName', 'quantity'],
    },
  },
  {
    name: 'receive_purchase_order',
    description: 'Registra o recebimento de um pedido da franqueadora.',
    input_schema: {
      type: 'object' as const,
      properties: {
        materialName: { type: 'string', description: 'Nome do material recebido' },
      },
      required: ['materialName'],
    },
  },
  {
    name: 'check_stock',
    description: 'Consulta o estoque atual de um material ou lista todos os materiais.',
    input_schema: {
      type: 'object' as const,
      properties: {
        materialName: { type: 'string', description: 'Nome do material (deixe vazio para listar todos)' },
      },
      required: [],
    },
  },
]

// ─── Tool implementations (execução no banco) ────────────────────────────────

type ToolInput = Record<string, unknown>

export async function executeTool(name: string, input: ToolInput, botUserId: string): Promise<string> {
  switch (name) {
    case 'launch_sale': {
      const { studentName, course, saleType, items } = input as {
        studentName: string
        course: string
        saleType: 'escola' | 'franqueadora'
        items?: { materialName: string; quantity: number }[]
      }

      if (saleType === 'franqueadora') {
        // Aluno compra o kit direto na franqueadora — sem impacto no estoque
        await prisma.sale.create({
          data: {
            studentName,
            course,
            saleType: 'franqueadora',
            sellerId: botUserId,
            saleDate: new Date(),
            status: 'entregue',
          },
        })
        return `Venda lançada. Aluno: ${studentName} | Curso: ${course} | Kit: aluno compra direto na franqueadora (sem movimentação de estoque)`
      }

      // saleType === 'escola': kit do estoque da escola
      if (!items || items.length === 0) {
        throw new Error('Para vendas com kit do estoque, informe os materiais e quantidades.')
      }

      const resolvedItems = await Promise.all(
        items.map(async (item) => {
          const material = await prisma.material.findFirst({
            where: { name: { contains: item.materialName, mode: 'insensitive' }, active: true },
          })
          if (!material) throw new Error(`Material "${item.materialName}" não encontrado no sistema`)
          return { materialId: material.id, quantity: item.quantity, name: material.name }
        })
      )

      await prisma.$transaction(async (tx) => {
        const sale = await tx.sale.create({
          data: {
            studentName,
            course,
            saleType: 'escola',
            sellerId: botUserId,
            saleDate: new Date(),
            status: 'pendente',
            items: {
              create: resolvedItems.map((i) => ({
                materialId: i.materialId,
                quantity: i.quantity,
                status: 'pendente',
              })),
            },
          },
        })
        for (const item of resolvedItems) {
          await tx.stockMovement.create({
            data: {
              type: 'venda_lancada',
              materialId: item.materialId,
              quantity: -item.quantity,
              saleId: sale.id,
              userId: botUserId,
              notes: `Venda via WhatsApp para ${studentName}`,
            },
          })
        }
      })

      const itemsText = resolvedItems.map((i) => `${i.quantity}x ${i.name}`).join(', ')
      return `Venda lançada. Aluno: ${studentName} | Curso: ${course} | Kit do estoque reservado: ${itemsText} (entrega pendente)`
    }

    case 'confirm_delivery': {
      const { studentName } = input as { studentName: string }

      const pending = await prisma.saleItem.findMany({
        where: {
          status: 'pendente',
          sale: { studentName: { contains: studentName, mode: 'insensitive' } },
        },
        include: { sale: true, material: true },
      })

      if (pending.length === 0) {
        return `Nenhuma entrega pendente encontrada para "${studentName}"`
      }

      for (const item of pending) {
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

      for (const saleId of [...new Set(pending.map((i) => i.saleId))]) {
        const all = await prisma.saleItem.findMany({ where: { saleId } })
        if (all.every((i) => i.status === 'entregue')) {
          await prisma.sale.update({ where: { id: saleId }, data: { status: 'entregue' } })
        }
      }

      const itemsList = pending.map((i) => `${i.quantity}x ${i.material.name}`).join(', ')
      return `Entrega confirmada para ${studentName}: ${itemsList}`
    }

    case 'cancel_sale': {
      const { studentName } = input as { studentName: string }

      const sale = await prisma.sale.findFirst({
        where: { status: 'pendente', studentName: { contains: studentName, mode: 'insensitive' } },
        include: { items: true },
      })
      if (!sale) return `Nenhuma venda pendente encontrada para "${studentName}"`

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

      return `Venda de ${studentName} cancelada com sucesso`
    }

    case 'stock_entry': {
      const { materialName, quantity, notes } = input as {
        materialName: string
        quantity: number
        notes?: string
      }

      const material = await prisma.material.findFirst({
        where: { name: { contains: materialName, mode: 'insensitive' }, active: true },
      })
      if (!material) return `Material "${materialName}" não encontrado no sistema`

      await prisma.$transaction(async (tx) => {
        await tx.stockEntry.create({
          data: { materialId: material.id, quantity, entryDate: new Date(), responsibleId: botUserId, notes },
        })
        await tx.material.update({
          where: { id: material.id },
          data: { stockCurrent: { increment: quantity } },
        })
        await tx.stockMovement.create({
          data: { type: 'entrada', materialId: material.id, quantity, userId: botUserId, notes: notes ?? 'Entrada via WhatsApp' },
        })
      })

      const updated = await prisma.material.findUnique({ where: { id: material.id } })
      return `Entrada registrada: ${quantity}x ${material.name}. Estoque atual: ${updated!.stockCurrent}`
    }

    case 'create_purchase_order': {
      const { materialName, quantity, notes } = input as {
        materialName: string
        quantity: number
        notes?: string
      }

      const material = await prisma.material.findFirst({
        where: { name: { contains: materialName, mode: 'insensitive' }, active: true },
      })
      if (!material) return `Material "${materialName}" não encontrado no sistema`

      await prisma.$transaction(async (tx) => {
        await tx.purchaseOrder.create({
          data: { materialId: material.id, quantity, orderDate: new Date(), responsibleId: botUserId, notes, status: 'aguardando' },
        })
        await tx.stockMovement.create({
          data: { type: 'pedido_franqueadora', materialId: material.id, quantity, userId: botUserId, notes: notes ?? 'Pedido via WhatsApp' },
        })
      })

      return `Pedido criado: ${quantity}x ${material.name} — aguardando chegada`
    }

    case 'receive_purchase_order': {
      const { materialName } = input as { materialName: string }

      const material = await prisma.material.findFirst({
        where: { name: { contains: materialName, mode: 'insensitive' }, active: true },
      })
      if (!material) return `Material "${materialName}" não encontrado no sistema`

      const order = await prisma.purchaseOrder.findFirst({
        where: { materialId: material.id, status: 'aguardando' },
        orderBy: { createdAt: 'asc' },
      })
      if (!order) return `Nenhum pedido pendente para "${materialName}"`

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
          data: { type: 'entrada', materialId: material.id, quantity: order.quantity, userId: botUserId, notes: 'Recebimento via WhatsApp' },
        })
      })

      const updated = await prisma.material.findUnique({ where: { id: material.id } })
      return `Pedido recebido: ${order.quantity}x ${material.name}. Estoque atual: ${updated!.stockCurrent}`
    }

    case 'check_stock': {
      const { materialName } = input as { materialName?: string }

      if (materialName) {
        const material = await prisma.material.findFirst({
          where: { name: { contains: materialName, mode: 'insensitive' }, active: true },
        })
        if (!material) return `Material "${materialName}" não encontrado`
        return `${material.name}: ${material.stockCurrent} unidades (mínimo: ${material.stockMinimum})`
      }

      const materials = await prisma.material.findMany({
        where: { active: true },
        orderBy: { name: 'asc' },
      })
      if (materials.length === 0) return 'Nenhum material cadastrado'
      return materials.map((m) => `• ${m.name}: ${m.stockCurrent} un.`).join('\n')
    }

    default:
      return `Ferramenta desconhecida: ${name}`
  }
}
