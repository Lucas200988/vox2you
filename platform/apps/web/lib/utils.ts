import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const brl = (v: number | string | null | undefined) =>
  v === null || v === undefined
    ? '—'
    : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v))

export function fmtDate(
  value: string | Date | null | undefined,
  opts: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  },
  timeZone?: string,
) {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('pt-BR', { ...opts, timeZone }).format(d)
}

export function relTime(value: string | Date | null | undefined) {
  if (!value) return ''
  const d = typeof value === 'string' ? new Date(value) : value
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return 'agora'
  if (diff < 3600) return `${Math.floor(diff / 60)} min`
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} d`
  return fmtDate(d, { day: '2-digit', month: 'short' })
}

export function initials(name: string | null | undefined) {
  if (!name) return '?'
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

export const STAGE_FALLBACK_COLOR = '#94a3b8'

export const FACT_LABELS: Record<string, string> = {
  goal: 'Objetivo',
  pain: 'Dor',
  objection: 'Objeção',
  interest_product: 'Produto de interesse',
  preferred_period: 'Período preferido',
  decision_timeline: 'Prazo de decisão',
  decision_maker: 'Decisor',
  budget_signal: 'Orçamento',
  company: 'Empresa',
  company_size: 'Tamanho da empresa',
  role: 'Cargo',
  availability: 'Disponibilidade',
  urgency: 'Urgência',
  city: 'Cidade',
  name: 'Nome',
  email: 'E-mail',
  profile_type: 'Perfil',
  previous_experience: 'Experiência prévia',
  contact_preference: 'Preferência de contato',
  do_not_contact_until: 'Não contatar até',
}

export const SOURCE_LABELS: Record<string, string> = {
  stated: 'informado',
  inferred: 'inferido',
  confirmed: 'confirmado',
  imported: 'importado',
}

export const INTENT_LABELS: Record<string, string> = {
  greeting: 'Saudação',
  info_request: 'Informação',
  price_request: 'Preço',
  schedule_request: 'Horários',
  booking_request: 'Agendamento',
  objection: 'Objeção',
  buying_signal: 'Sinal de compra',
  b2b_inquiry: 'B2B',
  human_request: 'Pediu humano',
  complaint: 'Reclamação',
  opt_out: 'Opt-out',
  off_topic: 'Fora do tema',
  follow_up_reply: 'Resposta a follow-up',
  smalltalk: 'Conversa',
  unknown: 'Indefinido',
}

export const DECISION_LABELS: Record<string, string> = {
  reply: 'Respondeu',
  handoff: 'Transferiu',
  silent: 'Silêncio',
  template_required: 'Exige template',
  blocked: 'Bloqueado',
}
