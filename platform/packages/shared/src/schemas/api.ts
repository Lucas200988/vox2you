import { z } from 'zod'

// ─── Shared DTO schemas used by API (validation) and Web (typing) ───

export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
})

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  /** Tenant slug — only needed when the same e-mail exists in more than one tenant. */
  tenant: z.string().min(1).optional(),
})

export const SendMessageSchema = z.object({
  text: z.string().min(1).max(4096).optional(),
  /** when true, message is sent as a template (outside 24h window) */
  templateName: z.string().optional(),
  templateLanguage: z.string().optional(),
  templateVariables: z.array(z.string()).optional(),
})

export const ConversationModeSchema = z.object({
  mode: z.enum(['ai', 'human', 'paused']),
  assigneeId: z.string().uuid().optional(),
  reason: z.string().optional(),
})

export const SimulateInboundSchema = z.object({
  unitId: z.string().uuid().optional(),
  channelId: z.string().uuid().optional(),
  phone: z.string().min(8),
  name: z.string().optional(),
  text: z.string().min(1),
  type: z.enum(['text', 'audio']).default('text'),
  referral: z
    .object({
      sourceUrl: z.string().optional(),
      headline: z.string().optional(),
      ctwaClid: z.string().optional(),
      adId: z.string().optional(),
    })
    .optional(),
})

export const PlaygroundRequestSchema = z.object({
  unitId: z.string().uuid(),
  messages: z.array(z.object({ role: z.enum(['customer', 'agent']), text: z.string() })).min(1),
  persona: z.string().optional(),
  productSlug: z.string().optional(),
  promptVersion: z.number().int().optional(),
  model: z.string().optional(),
  facts: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
})

export const ProductInputSchema = z.object({
  unitId: z.string().uuid().nullable().optional(),
  name: z.string().min(2),
  slug: z.string().min(2).optional(),
  category: z.string().default('course'),
  modality: z.string().optional(),
  audience: z.enum(['b2c', 'b2b', 'both']).optional(),
  shortDescription: z.string().optional(),
  description: z.string().optional(),
  personas: z.array(z.string()).default([]),
  painsSolved: z.array(z.string()).default([]),
  benefits: z.array(z.string()).default([]),
  durationText: z.string().optional(),
  format: z.string().optional(),
  salesArguments: z.array(z.string()).default([]),
  objectionHandlers: z.array(z.object({ objection: z.string(), response: z.string() })).default([]),
  status: z.enum(['active', 'inactive', 'draft']).default('active'),
})

export const OfferInputSchema = z.object({
  unitId: z.string().uuid().nullable().optional(),
  name: z.string().min(2),
  listPrice: z.number().nonnegative(),
  promoPrice: z.number().nonnegative().nullable().optional(),
  installmentsMax: z.number().int().positive().nullable().optional(),
  installmentValue: z.number().nonnegative().nullable().optional(),
  conditions: z.string().optional(),
  paymentMethods: z.array(z.string()).default([]),
  maxDiscountPct: z.number().min(0).max(100).default(0),
  discountRequiresApproval: z.boolean().default(true),
  validFrom: z.string().datetime().nullable().optional(),
  validTo: z.string().datetime().nullable().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
})

export const ClassScheduleInputSchema = z.object({
  unitId: z.string().uuid(),
  name: z.string().min(2),
  startsOn: z.string(), // YYYY-MM-DD
  endsOn: z.string().nullable().optional(),
  weekdays: z.array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])).min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  period: z.enum(['morning', 'afternoon', 'evening']).optional(),
  capacity: z.number().int().nonnegative().default(0),
  enrolled: z.number().int().nonnegative().default(0),
  status: z.enum(['open', 'full', 'closed', 'cancelled']).default('open'),
  notes: z.string().optional(),
})

export const KnowledgeDocumentInputSchema = z.object({
  unitId: z.string().uuid().nullable().optional(),
  productId: z.string().uuid().nullable().optional(),
  title: z.string().min(2),
  category: z.string().default('general'),
  sourceType: z.enum(['text', 'url', 'upload', 'faq']).default('text'),
  content: z.string().optional(),
  url: z.string().url().optional(),
  priority: z.number().int().min(1).max(10).default(5),
  validFrom: z.string().datetime().nullable().optional(),
  validTo: z.string().datetime().nullable().optional(),
  publish: z.boolean().default(false),
})

export const KnowledgeSearchSchema = z.object({
  unitId: z.string().uuid().optional(),
  query: z.string().min(2),
  productId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(20).default(6),
})

export const PromptVersionInputSchema = z.object({
  content: z.string().min(10),
  notes: z.string().optional(),
  model: z.string().optional(),
})

export const LeadStageChangeSchema = z.object({
  stageId: z.string().uuid().optional(),
  stageKey: z.string().optional(),
  reason: z.string().optional(),
  lostReasonId: z.string().uuid().optional(),
  lostReasonDetail: z.string().optional(),
  /** true when the human kept the reason the AI suggested (kept apart in analytics) */
  suggestedByAi: z.boolean().optional(),
})

export const LeadUpdateSchema = z.object({
  ownerId: z.string().uuid().nullable().optional(),
  interestProductId: z.string().uuid().nullable().optional(),
  estimatedValue: z.number().nullable().optional(),
  urgency: z.enum(['low', 'medium', 'high']).nullable().optional(),
  profileType: z.enum(['b2c', 'b2b']).nullable().optional(),
  title: z.string().optional(),
  nextFollowupAt: z.string().datetime().nullable().optional(),
  nextFollowupReason: z.string().nullable().optional(),
})

export const FactInputSchema = z.object({
  key: z.string(),
  value: z.string().min(1),
  source: z.enum(['stated', 'inferred', 'confirmed', 'imported']).default('confirmed'),
})

export const TaskInputSchema = z.object({
  leadId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  title: z.string().min(2),
  description: z.string().optional(),
  kind: z.enum(['call', 'message', 'email', 'visit', 'todo']).default('todo'),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  dueAt: z.string().datetime().optional(),
})

export const AppointmentInputSchema = z.object({
  leadId: z.string().uuid().optional(),
  contactId: z.string().uuid(),
  calendarId: z.string().uuid().optional(),
  kind: z.enum(['visit', 'trial_class', 'meeting', 'call']).default('visit'),
  title: z.string().min(2),
  startsAt: z.string().datetime(),
  durationMin: z.number().int().positive().default(60),
  notes: z.string().optional(),
})

/**
 * sdr    — the agent qualifies and books an in-person visit; it never presents products, prices,
 *          installments or discounts, even when asked (values are shown at the visit).
 * closer — the agent may present catalog offers and conduct the sale (original behaviour).
 */
export const SALES_MODES = ['sdr', 'closer'] as const
export type SalesMode = (typeof SALES_MODES)[number]

export const AgentSettingsInputSchema = z.object({
  enabled: z.boolean().optional(),
  agentName: z.string().optional(),
  salesMode: z.enum(SALES_MODES).optional(),
  /** How the agent names the in-person step, e.g. "visita presencial na unidade" */
  visitLabel: z.string().min(3).max(120).optional(),
  persona: z.string().nullable().optional(),
  tone: z.string().nullable().optional(),
  models: z.record(z.string(), z.string()).optional(),
  maxReplyChars: z.number().int().min(100).max(2000).optional(),
  maxQuestionsPerReply: z.number().int().min(0).max(3).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  autoStageTransitions: z.boolean().optional(),
  handoffRules: z.record(z.string(), z.unknown()).optional(),
  businessHours: z.record(z.string(), z.unknown()).optional(),
  outOfHoursMessage: z.string().nullable().optional(),
})

export const CopilotRequestSchema = z.object({
  conversationId: z.string().uuid(),
  mode: z.enum(['suggest', 'improve', 'summarize', 'next_action']).default('suggest'),
  draft: z.string().optional(),
})

export type LoginInput = z.infer<typeof LoginSchema>
export type SendMessageInput = z.infer<typeof SendMessageSchema>
export type SimulateInboundInput = z.infer<typeof SimulateInboundSchema>
export type PlaygroundRequest = z.infer<typeof PlaygroundRequestSchema>
export type ProductInput = z.infer<typeof ProductInputSchema>
export type OfferInput = z.infer<typeof OfferInputSchema>
export type KnowledgeDocumentInput = z.infer<typeof KnowledgeDocumentInputSchema>
