import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/prisma'
import { sendGroupMessage } from '@/lib/whatsapp'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const GROUP_ID = process.env.WHATSAPP_GROUP_ID!

export async function POST(req: NextRequest) {
  // Proteção simples por API key interna
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.WAHA_API_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const materials = await prisma.material.findMany({
      where: { active: true },
      include: {
        saleItems: {
          where: { status: 'pendente' },
          select: { quantity: true },
        },
        stockEntries: {
          where: {
            entryDate: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
          },
          select: { quantity: true },
        },
      },
      orderBy: { name: 'asc' },
    })

    const materialsData = materials.map(m => {
      const pendingQty = m.saleItems.reduce((sum, i) => sum + i.quantity, 0)
      const availableQty = m.stockCurrent - pendingQty
      const enteredThisWeek = m.stockEntries.reduce((sum, e) => sum + e.quantity, 0)
      return {
        name: m.name,
        code: m.code,
        stockCurrent: m.stockCurrent,
        stockMinimum: m.stockMinimum,
        availableQty,
        pendingQty,
        enteredThisWeek,
        needsReplenishment: availableQty <= m.stockMinimum,
      }
    })

    const dataText = JSON.stringify(materialsData, null, 2)

    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      system: `Você é um assistente de estoque da Vox2You. Gere um resumo semanal de estoque para o grupo de WhatsApp ADM/COMERCIAL.

Seja claro, objetivo e use emojis para facilitar a leitura.
Use *texto* para negrito no WhatsApp.
Destaque materiais que precisam de reposição com ⚠️.
Mencione entradas da semana se houver.
Finalize com uma frase motivacional curta.`,
      messages: [
        {
          role: 'user',
          content: `Gere o resumo semanal com base nesses dados de estoque:\n${dataText}`,
        },
      ],
    })

    const summary = aiResponse.content[0].type === 'text' ? aiResponse.content[0].text : ''

    await sendGroupMessage(GROUP_ID, summary)

    return NextResponse.json({ ok: true, summary })
  } catch (error) {
    console.error('[Summary] Erro:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
