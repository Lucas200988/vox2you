import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/prisma'
import { sendGroupMessage } from '@/lib/whatsapp'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const GROUP_ID = process.env.WHATSAPP_GROUP_ID!

// IDs de mensagens já processadas (evita duplicatas de message + message.any)
const processedIds = new Set<string>()

// Confirmações pendentes em memória (expira em 5 minutos)
const pendingConfirmations = new Map<string, {
  type: 'entrada' | 'entrega'
  materialId: string
  materialName: string
  quantity: number
  messageText: string
  expiresAt: number
}>()

// Encontra material mais próximo pelo nome usando Claude
async function findMaterial(materialName: string, materials: { id: string; name: string; code: string; stockCurrent: number }[]) {
  const materialsText = materials.map(m => `- ID: ${m.id} | Código: ${m.code} | Nome: ${m.name}`).join('\n')

  const aiResponse = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 256,
    system: `Dado um nome de material (pode ser abreviado ou parcial), encontre o material correspondente na lista.

Materiais:
${materialsText}

Responda APENAS em JSON puro:
{"materialId":"<id>","materialName":"<nome completo>","confidence":"high|medium|low"}

Se não encontrar correspondente razoável: {"materialId":null,"confidence":"low"}`,
    messages: [{ role: 'user', content: `Material: "${materialName}"` }],
  })

  const raw = aiResponse.content[0].type === 'text' ? aiResponse.content[0].text.trim() : '{}'
  const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim()
  try { return JSON.parse(clean) } catch { return { materialId: null, confidence: 'low' } }
}

// Registra movimentação no banco
async function registrarMovimentacao(
  type: 'entrada' | 'entrega',
  materialId: string,
  quantity: number,
  messageText: string,
  systemUserId: string
) {
  if (type === 'entrada') {
    await prisma.$transaction(async tx => {
      await tx.stockEntry.create({
        data: {
          materialId,
          quantity,
          entryDate: new Date(),
          responsibleId: systemUserId,
          notes: `Registrado via WhatsApp: "${messageText}"`,
        },
      })
      await tx.material.update({ where: { id: materialId }, data: { stockCurrent: { increment: quantity } } })
      await tx.stockMovement.create({
        data: { type: 'entrada', materialId, quantity, userId: systemUserId, notes: `Entrada via WhatsApp: "${messageText}"` },
      })
    })
  } else {
    await prisma.$transaction(async tx => {
      await tx.material.update({ where: { id: materialId }, data: { stockCurrent: { decrement: quantity } } })
      await tx.stockMovement.create({
        data: { type: 'entrega', materialId, quantity, userId: systemUserId, notes: `Saída via WhatsApp: "${messageText}"` },
      })
    })
  }

  return prisma.material.findUnique({ where: { id: materialId }, select: { name: true, stockCurrent: true } })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    console.log('[Webhook] Evento:', body.event, '| From:', body.payload?.from, '| Body:', body.payload?.body)

    if (body.event !== 'message' && body.event !== 'message.any') return NextResponse.json({ ok: true })

    const payload = body.payload
    if (!payload) return NextResponse.json({ ok: true })

    // Deduplicação — ignora se já processou essa mensagem
    const msgId = payload.id as string
    if (msgId && processedIds.has(msgId)) {
      console.log('[Webhook] Duplicata ignorada:', msgId)
      return NextResponse.json({ ok: true })
    }
    if (msgId) {
      processedIds.add(msgId)
      // Limpa IDs antigos para não crescer infinitamente
      if (processedIds.size > 500) {
        const first = processedIds.values().next().value
        processedIds.delete(first)
      }
    }

    const chatId = payload.chatId || payload.from
    if (chatId !== GROUP_ID) return NextResponse.json({ ok: true })

    if (payload.fromMe && payload.body?.startsWith('🤖 *Claudia*')) return NextResponse.json({ ok: true })

    const messageText = (payload.body as string)?.trim()
    if (!messageText) return NextResponse.json({ ok: true })

    const systemUser = await prisma.user.findFirst({ where: { role: 'gestor', active: true } })
    if (!systemUser) return NextResponse.json({ ok: true })

    // ── Resposta de confirmação ────────────────────────────────────────
    const isConfirm = /^(sim|s|confirma|confirmar|ok|yes|isso|correto)$/i.test(messageText)
    const isCancel = /^(não|nao|n|cancelar|cancela|errado)$/i.test(messageText)

    if (isConfirm || isCancel) {
      const pending = pendingConfirmations.get(GROUP_ID)
      if (pending && pending.expiresAt > Date.now()) {
        pendingConfirmations.delete(GROUP_ID)
        if (isCancel) {
          await sendGroupMessage(GROUP_ID, `🤖 *Claudia* — Assistente de Estoque\n\n❌ Registro cancelado.`)
          return NextResponse.json({ ok: true })
        }
        const updated = await registrarMovimentacao(pending.type, pending.materialId, pending.quantity, pending.messageText, systemUser.id)
        const emoji = pending.type === 'entrada' ? '➕' : '➖'
        const label = pending.type === 'entrada' ? 'Entrada' : 'Saída'
        await sendGroupMessage(GROUP_ID,
          `🤖 *Claudia* — Assistente de Estoque\n\n` +
          `✅ *${label} registrada!*\n\n` +
          `📦 Material: ${updated?.name}\n` +
          `${emoji} Quantidade: ${pending.quantity} unidades\n` +
          `📊 Estoque atual: ${updated?.stockCurrent} unidades`
        )
        return NextResponse.json({ ok: true })
      }
    }

    // ── Comandos diretos ───────────────────────────────────────────────
    const addMatch = messageText.match(/^\/adiciona\s+(\d+)\s+(.+)$/i)
    if (addMatch) {
      const quantity = parseInt(addMatch[1])
      const materialSearch = addMatch[2].trim()
      const materials = await prisma.material.findMany({ where: { active: true }, select: { id: true, name: true, code: true, stockCurrent: true }, orderBy: { name: 'asc' } })
      const found = await findMaterial(materialSearch, materials)
      if (!found.materialId || found.confidence === 'low') {
        await sendGroupMessage(GROUP_ID, `🤖 *Claudia* — Assistente de Estoque\n\n⚠️ Material "*${materialSearch}*" não encontrado.\nUse /materiais para ver a lista.`)
        return NextResponse.json({ ok: true })
      }
      const updated = await registrarMovimentacao('entrada', found.materialId, quantity, messageText, systemUser.id)
      await sendGroupMessage(GROUP_ID,
        `🤖 *Claudia* — Assistente de Estoque\n\n✅ *Entrada registrada!*\n\n📦 Material: ${updated?.name}\n➕ Adicionado: ${quantity} unidades\n📊 Estoque atual: ${updated?.stockCurrent} unidades`)
      return NextResponse.json({ ok: true })
    }

    const removeMatch = messageText.match(/^\/retirada\s+(\d+)\s+(.+)$/i)
    if (removeMatch) {
      const quantity = parseInt(removeMatch[1])
      const materialSearch = removeMatch[2].trim()
      const materials = await prisma.material.findMany({ where: { active: true }, select: { id: true, name: true, code: true, stockCurrent: true }, orderBy: { name: 'asc' } })
      const found = await findMaterial(materialSearch, materials)
      if (!found.materialId || found.confidence === 'low') {
        await sendGroupMessage(GROUP_ID, `🤖 *Claudia* — Assistente de Estoque\n\n⚠️ Material "*${materialSearch}*" não encontrado.\nUse /materiais para ver a lista.`)
        return NextResponse.json({ ok: true })
      }
      const updated = await registrarMovimentacao('entrega', found.materialId, quantity, messageText, systemUser.id)
      await sendGroupMessage(GROUP_ID,
        `🤖 *Claudia* — Assistente de Estoque\n\n✅ *Saída registrada!*\n\n📦 Material: ${updated?.name}\n➖ Retirado: ${quantity} unidades\n📊 Estoque atual: ${updated?.stockCurrent} unidades`)
      return NextResponse.json({ ok: true })
    }

    if (/^\/estoque$/i.test(messageText)) {
      const materials = await prisma.material.findMany({ where: { active: true }, select: { name: true, stockCurrent: true, stockMinimum: true }, orderBy: { name: 'asc' } })
      const lines = materials.map(m => `• ${m.name}: *${m.stockCurrent}* unid${m.stockCurrent <= m.stockMinimum ? ' ⚠️' : ''}`).join('\n')
      await sendGroupMessage(GROUP_ID, `🤖 *Claudia* — Assistente de Estoque\n\n📊 *Estoque atual:*\n\n${lines}\n\n_⚠️ = abaixo do mínimo_`)
      return NextResponse.json({ ok: true })
    }

    if (/^\/materiais$/i.test(messageText)) {
      const materials = await prisma.material.findMany({ where: { active: true }, select: { name: true, code: true }, orderBy: { name: 'asc' } })
      const lines = materials.map(m => `• ${m.name} (${m.code})`).join('\n')
      await sendGroupMessage(GROUP_ID,
        `🤖 *Claudia* — Assistente de Estoque\n\n📋 *Materiais cadastrados:*\n\n${lines}\n\n_Comandos:_\n▶ /adiciona [qtd] [material]\n▶ /retirada [qtd] [material]\n▶ /estoque`)
      return NextResponse.json({ ok: true })
    }

    // ── Linguagem natural (IA) ─────────────────────────────────────────
    const materials = await prisma.material.findMany({ where: { active: true }, select: { id: true, name: true, code: true, stockCurrent: true }, orderBy: { name: 'asc' } })
    const materialsText = materials.map(m => `- ID: ${m.id} | Código: ${m.code} | Nome: ${m.name} | Estoque: ${m.stockCurrent}`).join('\n')

    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 512,
      system: `Você é um assistente de controle de estoque da Vox2You. Analise mensagens do grupo e identifique movimentações de material didático.

Materiais:
${materialsText}

Responda APENAS em JSON puro, sem markdown.

ENTRADA (compra, recebimento): {"type":"entrada","materialId":"<id>","materialName":"<nome>","quantity":<n>,"confidence":"high|medium|low"}
SAÍDA (entrega, distribuição, uso): {"type":"saida","materialId":"<id>","materialName":"<nome>","quantity":<n>,"confidence":"high|medium|low"}
Outra coisa: {"type":"other"}

Palavras de ENTRADA: recebi, chegou, comprei, adquiri, entrada, recebemos, comprado
Palavras de SAÍDA: entregue, entreguei, saiu, distribuí, usei, saída, entregamos, retirei

Regras:
- Se for claramente uma conversa normal (pergunta, comentário, emoji), responda "other"
- Só responda entrada/saída se tiver razoável certeza de que é sobre estoque
- Busque material mais próximo pelo nome mesmo com abreviações`,
      messages: [{ role: 'user', content: messageText }],
    })

    const rawText = aiResponse.content[0].type === 'text' ? aiResponse.content[0].text.trim() : ''
    const aiText = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim()

    let parsed: { type: string; materialId?: string; materialName?: string; quantity?: number; confidence?: string }
    try { parsed = JSON.parse(aiText) } catch { return NextResponse.json({ ok: true }) }

    if (parsed.type === 'other' || !parsed.materialId || !parsed.quantity) return NextResponse.json({ ok: true })

    const movType = parsed.type === 'entrada' ? 'entrada' : 'entrega'
    const label = parsed.type === 'entrada' ? 'Entrada' : 'Saída'
    const emoji = parsed.type === 'entrada' ? '➕' : '➖'

    if (parsed.confidence === 'low') return NextResponse.json({ ok: true })

    if (parsed.confidence === 'high') {
      // Registra direto
      const updated = await registrarMovimentacao(movType, parsed.materialId, parsed.quantity, messageText, systemUser.id)
      await sendGroupMessage(GROUP_ID,
        `🤖 *Claudia* — Assistente de Estoque\n\n` +
        `✅ *${label} registrada automaticamente!*\n\n` +
        `📦 Material: ${updated?.name}\n` +
        `${emoji} Quantidade: ${parsed.quantity} unidades\n` +
        `📊 Estoque atual: ${updated?.stockCurrent} unidades\n\n` +
        `_Não foi isso? Responda *não* para cancelar._`
      )

      // Guarda como confirmação pendente por 2 min (para permitir cancelamento)
      pendingConfirmations.set(GROUP_ID, {
        type: movType,
        materialId: parsed.materialId,
        materialName: parsed.materialName || '',
        quantity: parsed.quantity,
        messageText,
        expiresAt: Date.now() + 2 * 60 * 1000,
      })
    } else {
      // Confidence medium — pede confirmação
      pendingConfirmations.set(GROUP_ID, {
        type: movType,
        materialId: parsed.materialId,
        materialName: parsed.materialName || '',
        quantity: parsed.quantity,
        messageText,
        expiresAt: Date.now() + 5 * 60 * 1000,
      })

      await sendGroupMessage(GROUP_ID,
        `🤖 *Claudia* — Assistente de Estoque\n\n` +
        `🤔 Entendi que houve uma *${label.toLowerCase()}* de estoque:\n\n` +
        `📦 Material: *${parsed.materialName}*\n` +
        `${emoji} Quantidade: *${parsed.quantity}* unidades\n\n` +
        `Está correto? Responda *sim* para confirmar ou *não* para cancelar.`
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[Webhook] Erro:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
