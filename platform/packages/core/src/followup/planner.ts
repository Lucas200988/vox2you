import type { Classification } from '@vox/shared'
import { addHours } from '@vox/shared'

export interface FollowUpPlanInput {
  classification: Classification | null
  stageKey: string
  facts: Array<{ key: string; value: string }>
  agentRequested?: { hours: number; reason: string } | null
  doNotContactUntil?: Date | null
  optedOut: boolean
  lastInboundAt: Date
  hasScheduledAppointment: boolean
  attemptsSoFar: number
  policy: {
    maxAttempts: number
    strategies: Record<string, { delayHours?: number; goal?: string }>
  }
  now?: Date
}

export interface FollowUpPlan {
  schedule: boolean
  scheduledAt?: Date
  reason: string
  goal?: string
  scenario?: string
  strategy?: 'text' | 'template' | 'task_for_human'
}

const DEFAULT_STRATEGIES: Record<string, { delayHours: number; goal: string }> = {
  price_then_silence: {
    delayHours: 22,
    goal: 'Retomar reforçando o objetivo da pessoa e propor 2 horários de visita',
  },
  abandoned_scheduling: {
    delayHours: 4,
    goal: 'Facilitar a escolha do horário oferecendo 2 opções',
  },
  asked_later: { delayHours: 72, goal: 'Retomar com leveza e conteúdo de valor' },
  qualified_waiting_payment: {
    delayHours: 48,
    goal: 'Confirmar se conseguiu resolver e oferecer ajuda',
  },
  objection_open: { delayHours: 30, goal: 'Trazer prova/depoimento relacionado à objeção' },
  generic: { delayHours: 26, goal: 'Reengajar com pergunta leve sobre o objetivo' },
}

/**
 * Decides whether/when/why to follow up after an inbound message. Runs after every agent reply;
 * the scheduled follow-up is cancelled automatically when the customer writes again.
 */
export function planFollowUp(input: FollowUpPlanInput): FollowUpPlan {
  const now = input.now ?? new Date()
  if (input.optedOut) return { schedule: false, reason: 'opt_out' }
  if (['won', 'lost'].includes(input.stageKey))
    return { schedule: false, reason: `stage_${input.stageKey}` }
  if (input.hasScheduledAppointment) return { schedule: false, reason: 'appointment_scheduled' }
  if (input.attemptsSoFar >= input.policy.maxAttempts)
    return { schedule: false, reason: 'max_attempts_reached', strategy: 'task_for_human' }

  const strategies = { ...DEFAULT_STRATEGIES, ...input.policy.strategies }
  const dnc = input.doNotContactUntil ?? parseDoNotContact(input.facts)
  if (dnc && dnc > now) {
    return {
      schedule: true,
      scheduledAt: dnc,
      reason: 'customer_asked_later',
      goal: 'Retomar conforme combinado',
      scenario: 'asked_later',
      strategy: 'template',
    }
  }
  if (input.agentRequested) {
    return {
      schedule: true,
      scheduledAt: addHours(now, input.agentRequested.hours),
      reason: input.agentRequested.reason,
      goal: strategies['generic']?.goal,
      scenario: 'agent_requested',
      strategy: 'text',
    }
  }

  const intent = input.classification?.intent
  const signals = input.classification?.signals ?? []
  let scenario = 'generic'
  if (intent === 'price_request') scenario = 'price_then_silence'
  else if (intent === 'booking_request' || input.stageKey === 'scheduling')
    scenario = 'abandoned_scheduling'
  else if (signals.includes('later') || intent === 'objection')
    scenario = signals.includes('later') ? 'asked_later' : 'objection_open'
  else if (input.stageKey === 'negotiation') scenario = 'qualified_waiting_payment'
  else if (intent === 'opt_out' || intent === 'human_request' || intent === 'complaint')
    return { schedule: false, reason: `intent_${intent}` }
  else if (intent === 'off_topic' || intent === 'smalltalk')
    return { schedule: false, reason: 'no_commercial_context' }

  const strategy = strategies[scenario] ?? DEFAULT_STRATEGIES['generic']!
  const delay = (strategy.delayHours ?? 26) * (1 + input.attemptsSoFar * 0.6) // back-off on each attempt
  return {
    schedule: true,
    scheduledAt: addHours(now, delay),
    reason: `scenario:${scenario}`,
    goal: strategy.goal,
    scenario,
    strategy: 'text',
  }
}

function parseDoNotContact(facts: Array<{ key: string; value: string }>): Date | null {
  const f = facts.find((x) => x.key === 'do_not_contact_until')
  if (!f) return null
  const d = new Date(f.value)
  return Number.isNaN(d.getTime()) ? null : d
}
