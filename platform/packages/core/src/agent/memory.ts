import type { Db, DbTx } from '@vox/db'
import { truncate } from '@vox/shared'
import type { MemorySnapshot } from './types.js'
import { NotFoundError } from '../errors.js'
import type { LLMProvider } from '../providers/llm.js'
import { PromptRegistry } from '../prompts/registry.js'

/** Loads the three memory layers: immediate (recent messages), summarized, structured (facts). */
export async function loadMemory(
  db: Db | DbTx,
  conversationId: string,
  recentLimit = 20,
): Promise<MemorySnapshot> {
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    include: {
      channel: { select: { id: true, kind: true } },
      contact: {
        include: {
          company: { select: { name: true } },
          consents: { where: { purpose: 'marketing' } },
        },
      },
      lead: {
        include: {
          stage: true,
          facts: { where: { status: 'active' }, orderBy: { updatedAt: 'desc' } },
        },
      },
    },
  })
  if (!conversation) throw new NotFoundError('Conversation', conversationId)

  const [recent, inboundCount, outboundCount, appointmentsCount, lastRuns, upcomingAppointment] =
    await Promise.all([
      db.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: recentLimit,
        select: {
          id: true,
          direction: true,
          authorType: true,
          text: true,
          transcript: true,
          type: true,
          createdAt: true,
        },
      }),
      db.message.count({ where: { conversationId, direction: 'inbound' } }),
      db.message.count({ where: { conversationId, direction: 'outbound' } }),
      conversation.leadId
        ? db.appointment.count({
            where: { leadId: conversation.leadId, status: { in: ['scheduled', 'confirmed'] } },
          })
        : Promise.resolve(0),
      db.agentRun.findMany({
        where: { conversationId, kind: 'reply' },
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: { decision: true },
      }),
      conversation.leadId
        ? db.appointment.findFirst({
            where: {
              leadId: conversation.leadId,
              status: { in: ['scheduled', 'confirmed'] },
              endsAt: { gte: new Date(Date.now() - 36e5) },
            },
            orderBy: { startsAt: 'asc' },
            select: { id: true, startsAt: true, endsAt: true, status: true, kind: true },
          })
        : Promise.resolve(null),
    ])
  let consecutiveBlockedRuns = 0
  for (const r of lastRuns) {
    if (r.decision === 'blocked') consecutiveBlockedRuns++
    else break
  }

  return {
    contact: {
      id: conversation.contact.id,
      name: conversation.contact.name,
      firstName: conversation.contact.firstName,
      phone: conversation.contact.phone,
      email: conversation.contact.email,
      profileType: conversation.contact.profileType,
      source: conversation.contact.source,
      city: conversation.contact.city,
      company: conversation.contact.company,
    },
    lead: conversation.lead
      ? {
          id: conversation.lead.id,
          stageKey: conversation.lead.stage.key,
          stageName: conversation.lead.stage.name,
          score: conversation.lead.score,
          ownerId: conversation.lead.ownerId,
          interestProductId: conversation.lead.interestProductId,
          recommendedProductId: conversation.lead.recommendedProductId,
          doNotContactUntil: conversation.lead.doNotContactUntil,
          createdAt: conversation.lead.createdAt,
        }
      : null,
    conversation: {
      id: conversation.id,
      mode: conversation.mode,
      summary: conversation.summary,
      lastInboundAt: conversation.lastInboundAt,
      channelKind: conversation.channel.kind,
      channelId: conversation.channel.id,
      contactId: conversation.contactId,
      unitId: conversation.unitId,
      leadId: conversation.leadId,
    },
    recent: recent
      .reverse()
      .map((m) => ({
        id: m.id,
        direction: m.direction as 'inbound' | 'outbound',
        authorType: m.authorType,
        text: m.text ?? m.transcript ?? `[${m.type}]`,
        createdAt: m.createdAt,
      })),
    facts: (conversation.lead?.facts ?? []).map((f) => ({
      id: f.id,
      key: f.key,
      value: f.value,
      source: f.source,
      confidence: f.confidence,
    })),
    inboundCount,
    outboundCount,
    appointmentsCount,
    upcomingAppointment,
    consecutiveBlockedRuns,
    optedOut: conversation.contact.consents.some((c) => c.status === 'opted_out'),
  }
}

export function renderHistory(recent: MemorySnapshot['recent'], maxChars = 4000): string {
  const lines = recent.map(
    (m) =>
      `${m.direction === 'inbound' ? 'Cliente' : m.authorType === 'user' ? 'Consultor(humano)' : 'Agente'}: ${truncate(m.text, 600)}`,
  )
  let out = lines.join('\n')
  while (out.length > maxChars && lines.length > 2) {
    lines.shift()
    out = lines.join('\n')
  }
  return out
}

export function renderFacts(facts: MemorySnapshot['facts']): string {
  if (!facts.length) return '(nenhum fato registrado ainda)'
  return facts
    .map(
      (f) =>
        `- ${f.key}: ${f.value} (${f.source === 'inferred' ? 'inferido' : f.source === 'confirmed' ? 'confirmado' : 'informado pelo cliente'})`,
    )
    .join('\n')
}

export function renderLeadProfile(m: MemorySnapshot): string {
  const c = m.contact
  const parts = [
    c.name
      ? `Nome: ${c.name}`
      : 'Nome: desconhecido (não pergunte de forma forçada; capture naturalmente)',
    c.profileType ? `Perfil: ${c.profileType.toUpperCase()}` : null,
    c.company?.name ? `Empresa: ${c.company.name}` : null,
    c.city ? `Cidade: ${c.city}` : null,
    c.source ? `Origem: ${c.source}` : null,
    m.lead ? `Score: ${m.lead.score}/100` : null,
    `Mensagens do cliente nesta conversa: ${m.inboundCount}`,
  ]
  return parts.filter(Boolean).join('\n')
}

/** Regenerates the conversation summary every N messages (medium-term memory). */
export class ConversationSummarizer {
  constructor(
    private readonly db: Db,
    private readonly llm: LLMProvider,
    private readonly prompts: PromptRegistry,
  ) {}

  async maybeUpdate(
    tenantId: string,
    conversationId: string,
    model: string,
    everyNMessages = 8,
  ): Promise<{ updated: boolean; costUsd: number }> {
    const conv = await this.db.conversation.findUnique({
      where: { id: conversationId },
      select: { summary: true, summaryUpToMessageId: true },
    })
    if (!conv) return { updated: false, costUsd: 0 }
    const since = conv.summaryUpToMessageId
      ? await this.db.message.findUnique({
          where: { id: conv.summaryUpToMessageId },
          select: { createdAt: true },
        })
      : null
    const newMessages = await this.db.message.findMany({
      where: { conversationId, ...(since ? { createdAt: { gt: since.createdAt } } : {}) },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        direction: true,
        authorType: true,
        text: true,
        transcript: true,
        type: true,
        createdAt: true,
      },
    })
    if (newMessages.length < everyNMessages) return { updated: false, costUsd: 0 }
    const prompt = await this.prompts.resolve(tenantId, 'summarize.conversation')
    const history = renderHistory(
      newMessages.map((m) => ({
        id: m.id,
        direction: m.direction as 'inbound' | 'outbound',
        authorType: m.authorType,
        text: m.text ?? m.transcript ?? `[${m.type}]`,
        createdAt: m.createdAt,
      })),
      8000,
    )
    const res = await this.llm.complete({
      model,
      task: 'summarize',
      system: 'Você resume conversas comerciais de forma factual e compacta.',
      messages: [
        {
          role: 'user',
          content: PromptRegistry.render(prompt.content, {
            previous_summary: conv.summary ?? '(nenhum)',
            history,
          }),
        },
      ],
      maxTokens: 400,
      temperature: 0.2,
    })
    const last = newMessages[newMessages.length - 1]!
    await this.db.conversation.update({
      where: { id: conversationId },
      data: { summary: res.text.trim().slice(0, 2000), summaryUpToMessageId: last.id },
    })
    return { updated: true, costUsd: res.costUsd }
  }
}
