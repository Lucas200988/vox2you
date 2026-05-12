import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import type { Client } from 'whatsapp-web.js'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

function weekRange() {
  const now = new Date()
  const day = now.getDay()
  const diffToMonday = (day === 0 ? -6 : 1 - day)
  const monday = new Date(now)
  monday.setDate(now.getDate() + diffToMonday)
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { start: monday, end: sunday }
}

function fmt(date: Date) {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export async function buildWeeklyReport(): Promise<string> {
  const { start, end } = weekRange()
  const weekNum = Math.ceil(
    (new Date(start).setHours(0, 0, 0, 0) - new Date(start.getFullYear(), 0, 1).getTime()) /
      (7 * 24 * 60 * 60 * 1000)
  )

  const [materials, sales, entries, pendingDeliveries, pendingOrders, lowStock] = await Promise.all([
    prisma.material.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),

    prisma.sale.findMany({
      where: { createdAt: { gte: start, lte: end } },
      include: { items: true },
    }),

    prisma.stockEntry.findMany({
      where: { createdAt: { gte: start, lte: end } },
      include: { material: { select: { name: true } } },
    }),

    prisma.saleItem.count({ where: { status: 'pendente' } }),

    prisma.purchaseOrder.findMany({
      where: { status: 'aguardando' },
      include: { material: { select: { name: true } } },
    }),

    prisma.material.findMany({
      where: { active: true, stockCurrent: { lte: prisma.material.fields.stockMinimum } },
      orderBy: { name: 'asc' },
    }),
  ])

  const lines: string[] = []

  lines.push(`📊 *Relatório Semanal — Semana ${weekNum}*`)
  lines.push(`📅 ${fmt(start)} a ${fmt(end)}`)
  lines.push('')

  // Estoque atual
  lines.push('*📦 ESTOQUE ATUAL*')
  if (materials.length === 0) {
    lines.push('Nenhum material cadastrado')
  } else {
    for (const m of materials) {
      const ok = m.stockCurrent > m.stockMinimum
      const icon = ok ? '✅' : m.stockCurrent === 0 ? '🔴' : '⚠️'
      const minNote = !ok ? ` _(mín: ${m.stockMinimum})_` : ''
      lines.push(`${icon} ${m.name}: ${m.stockCurrent} un.${minNote}`)
    }
  }
  lines.push('')

  // Alertas de reposição
  if (lowStock.length > 0) {
    lines.push('*🚨 REPOSIÇÃO NECESSÁRIA*')
    for (const m of lowStock) {
      const falta = m.stockMinimum - m.stockCurrent
      const status = m.stockCurrent === 0 ? 'ZERADO' : `faltam ${falta} un.`
      lines.push(`• ${m.name}: ${status}`)
    }
    lines.push('')
  }

  // Vendas da semana
  lines.push('*🛍️ VENDAS DA SEMANA*')
  if (sales.length === 0) {
    lines.push('Nenhuma venda registrada')
  } else {
    const entregues = sales.filter((s) => s.status === 'entregue').length
    const pendentes = sales.filter((s) => s.status === 'pendente').length
    const canceladas = sales.filter((s) => s.status === 'cancelado').length
    const escola = sales.filter((s) => s.saleType === 'escola').length
    const franqueadora = sales.filter((s) => s.saleType === 'franqueadora').length
    lines.push(`• Total: ${sales.length} vendas`)
    lines.push(`• ✅ Entregues: ${entregues} | ⏳ Pendentes: ${pendentes} | ❌ Canceladas: ${canceladas}`)
    lines.push(`• Escola: ${escola} | Franqueadora: ${franqueadora}`)
  }
  lines.push('')

  // Entradas da semana
  lines.push('*📥 ENTRADAS DE ESTOQUE*')
  if (entries.length === 0) {
    lines.push('Nenhuma entrada registrada')
  } else {
    const grouped = entries.reduce<Record<string, number>>((acc, e) => {
      acc[e.material.name] = (acc[e.material.name] ?? 0) + e.quantity
      return acc
    }, {})
    for (const [name, qty] of Object.entries(grouped)) {
      lines.push(`• ${qty}x ${name}`)
    }
  }
  lines.push('')

  // Entregas pendentes
  if (pendingDeliveries > 0) {
    lines.push(`*⏳ ENTREGAS PENDENTES: ${pendingDeliveries} item(s)*`)
    lines.push('')
  }

  // Pedidos à franqueadora
  if (pendingOrders.length > 0) {
    lines.push('*📋 PEDIDOS AGUARDANDO*')
    for (const o of pendingOrders) {
      lines.push(`• ${o.quantity}x ${o.material.name}`)
    }
    lines.push('')
  }

  lines.push('_Relatório gerado automaticamente pela Vivi_ 🤖')

  return lines.join('\n')
}

export async function sendWeeklyReport(whatsapp: Client, groupId: string): Promise<void> {
  try {
    console.log('📊 Gerando relatório semanal...')
    const report = await buildWeeklyReport()
    await whatsapp.sendMessage(groupId, report)
    console.log('✅ Relatório semanal enviado')
  } catch (err) {
    console.error('❌ Erro ao enviar relatório:', err)
  }
}
