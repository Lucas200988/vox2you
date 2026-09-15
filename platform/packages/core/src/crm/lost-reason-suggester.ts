import type { Db } from '@vox/db'
import { NotFoundError } from '../errors.js'
import type { TenantContext } from '../tenant/context.js'

export interface LostReasonSuggestion {
  reasonId: string
  key: string
  name: string
  confidence: number
  why: string
}

/** Classification signal / intent → lost reason key (child first, parent as fallback). */
const BY_SIGNAL: Array<{
  match: (intents: string[], signals: string[]) => number
  keys: string[]
  why: string
}> = [
  {
    match: (_i, s) => count(s, 'price_objection') + count(s, 'discount_request'),
    keys: ['price_high', 'price'],
    why: 'objeção de preço na conversa',
  },
  {
    match: (_i, s) => count(s, 'time_objection'),
    keys: ['time_busy', 'time'],
    why: 'disse não ter tempo/agenda agora',
  },
  {
    match: (_i, s) => count(s, 'spouse_decision'),
    keys: ['no_approval'],
    why: 'depende de outra pessoa para decidir',
  },
  {
    match: (_i, s) => count(s, 'later'),
    keys: ['no_urgency'],
    why: 'pediu para falar depois',
  },
  {
    match: (i) => count(i, 'opt_out'),
    keys: ['other'],
    why: 'pediu para não receber mais mensagens',
  },
]

function count(list: string[], value: string): number {
  return list.filter((x) => x === value).length
}

/**
 * Suggests a structured lost reason from what the agent observed (objection signals, intents,
 * silence). It is a suggestion: the human confirms or changes it when marking the lead as lost.
 */
export async function suggestLostReason(
  db: Db,
  ctx: TenantContext,
  leadId: string,
  now = new Date(),
): Promise<LostReasonSuggestion | null> {
  const lead = await db.lead.findFirst({
    where: { id: leadId, tenantId: ctx.tenantId },
    select: {
      id: true,
      createdAt: true,
      conversations: {
        select: { lastInboundAt: true },
        orderBy: { lastMessageAt: 'desc' },
        take: 1,
      },
      agentRuns: {
        select: { classification: true },
        where: { kind: 'reply' },
        orderBy: { createdAt: 'desc' },
        take: 12,
      },
    },
  })
  if (!lead) throw new NotFoundError('Lead', leadId)

  const intents: string[] = []
  const signals: string[] = []
  for (const run of lead.agentRuns) {
    const c = run.classification as { intent?: string; signals?: string[] } | null
    if (c?.intent) intents.push(c.intent)
    for (const s of c?.signals ?? []) signals.push(s)
  }

  let best: { keys: string[]; why: string; hits: number } | null = null
  for (const rule of BY_SIGNAL) {
    const hits = rule.match(intents, signals)
    if (hits > 0 && (!best || hits > best.hits)) best = { keys: rule.keys, why: rule.why, hits }
  }
  let confidence = best ? Math.min(0.9, 0.5 + best.hits * 0.15) : 0
  let keys = best?.keys ?? []
  let why = best?.why ?? ''

  if (!best) {
    const lastInbound = lead.conversations[0]?.lastInboundAt ?? lead.createdAt
    const silentDays = (now.getTime() - lastInbound.getTime()) / 864e5
    if (silentDays >= 5) {
      keys = ['no_response']
      why = `sem resposta há ${Math.floor(silentDays)} dias`
      confidence = silentDays >= 14 ? 0.8 : 0.6
    }
  }
  if (!keys.length) return null

  const reasons = await db.lostReason.findMany({
    where: { tenantId: ctx.tenantId, active: true, key: { in: keys } },
    select: { id: true, key: true, name: true },
  })
  for (const key of keys) {
    const r = reasons.find((x) => x.key === key)
    if (r) return { reasonId: r.id, key: r.key, name: r.name, confidence, why }
  }
  return null
}
