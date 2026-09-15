export const ROLES = ['owner', 'admin', 'manager', 'seller', 'viewer'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_RANK: Record<Role, number> = { owner: 5, admin: 4, manager: 3, seller: 2, viewer: 1 }

export const STAGE_KEYS = [
  'new',
  'conversing',
  'discovery',
  'qualified',
  'offer',
  'scheduling',
  'negotiation',
  'won',
  'lost',
  'nurture',
] as const
export type StageKey = (typeof STAGE_KEYS)[number]

export const DEFAULT_PIPELINE_STAGES: Array<{
  key: StageKey
  name: string
  kind: 'open' | 'won' | 'lost' | 'nurture'
  probability: number
  color: string
  maxHoursInStage?: number
}> = [
  { key: 'new', name: 'Novo Lead', kind: 'open', probability: 5, color: '#94a3b8', maxHoursInStage: 2 },
  { key: 'conversing', name: 'Em Conversa', kind: 'open', probability: 10, color: '#60a5fa', maxHoursInStage: 24 },
  { key: 'discovery', name: 'Descoberta', kind: 'open', probability: 20, color: '#818cf8', maxHoursInStage: 48 },
  { key: 'qualified', name: 'Qualificado', kind: 'open', probability: 35, color: '#a78bfa', maxHoursInStage: 72 },
  { key: 'offer', name: 'Oferta/Apresentação', kind: 'open', probability: 50, color: '#f59e0b', maxHoursInStage: 72 },
  { key: 'scheduling', name: 'Agendamento', kind: 'open', probability: 60, color: '#fb923c', maxHoursInStage: 96 },
  { key: 'negotiation', name: 'Negociação', kind: 'open', probability: 75, color: '#f97316', maxHoursInStage: 120 },
  { key: 'won', name: 'Matrícula/Venda', kind: 'won', probability: 100, color: '#22c55e' },
  { key: 'lost', name: 'Perdido', kind: 'lost', probability: 0, color: '#ef4444' },
  { key: 'nurture', name: 'Nutrição', kind: 'nurture', probability: 5, color: '#14b8a6' },
]

export const DEFAULT_LOST_REASONS: Array<{ key: string; name: string; children?: Array<{ key: string; name: string }> }> = [
  { key: 'price', name: 'Preço', children: [{ key: 'price_high', name: 'Achou caro' }, { key: 'price_budget', name: 'Sem orçamento' }] },
  { key: 'time', name: 'Tempo/Agenda', children: [{ key: 'time_schedule', name: 'Horário incompatível' }, { key: 'time_busy', name: 'Sem tempo agora' }] },
  { key: 'no_urgency', name: 'Sem urgência' },
  { key: 'no_response', name: 'Não respondeu' },
  { key: 'competitor', name: 'Concorrente' },
  { key: 'product_fit', name: 'Produto inadequado' },
  { key: 'distance', name: 'Distância' },
  { key: 'financial', name: 'Financeiro' },
  { key: 'no_approval', name: 'Sem aprovação (decisor)' },
  { key: 'other', name: 'Outro' },
]

export const FACT_KEYS = [
  'goal',
  'pain',
  'objection',
  'interest_product',
  'preferred_period',
  'decision_timeline',
  'decision_maker',
  'budget_signal',
  'company',
  'company_size',
  'role',
  'availability',
  'urgency',
  'city',
  'name',
  'email',
  'profile_type',
  'previous_experience',
  'contact_preference',
  'do_not_contact_until',
] as const
export type FactKey = (typeof FACT_KEYS)[number]

export const PROMPT_KEYS = [
  'conversation.system',
  'classify.intent',
  'extract.facts',
  'validate.reply',
  'summarize.conversation',
  'evaluate.conversation',
  'copilot.suggest',
  'followup.compose',
] as const
export type PromptKey = (typeof PROMPT_KEYS)[number]

export const WHATSAPP_SESSION_WINDOW_HOURS = 24

export const API_KEY_SCOPES = [
  'contacts:read',
  'contacts:write',
  'leads:read',
  'leads:write',
  'messages:send',
  'events:write',
  'knowledge:write',
] as const
