import { z } from 'zod'
import { FACT_KEYS } from '../constants.js'

export const INTENTS = [
  'greeting',
  'info_request', // "como funciona o curso"
  'price_request',
  'schedule_request', // horários / turmas
  'booking_request', // quer agendar visita/aula
  'objection',
  'buying_signal', // quer se matricular
  'b2b_inquiry',
  'human_request',
  'complaint',
  'opt_out',
  'off_topic',
  'follow_up_reply', // responding to a follow-up
  'smalltalk',
  'unknown',
] as const
export type Intent = (typeof INTENTS)[number]

export const SENTIMENTS = ['positive', 'neutral', 'negative', 'frustrated'] as const

export const ClassificationSchema = z.object({
  intent: z.enum(INTENTS),
  secondaryIntents: z.array(z.enum(INTENTS)).default([]),
  sentiment: z.enum(SENTIMENTS).default('neutral'),
  urgency: z.enum(['low', 'medium', 'high']).default('low'),
  /** Commercial signals: shame, camera_block, team_sales, price_objection, time_objection, spouse_decision, later, ... */
  signals: z.array(z.string()).default([]),
  profileType: z.enum(['b2c', 'b2b', 'unknown']).default('unknown'),
  needsKnowledge: z.boolean().default(false),
  needsCatalog: z.boolean().default(false),
  needsCalendar: z.boolean().default(false),
  requestsHuman: z.boolean().default(false),
  isEmotional: z.boolean().default(false),
  mentionsProducts: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.7),
  reasoning: z.string().optional(),
})
export type Classification = z.infer<typeof ClassificationSchema>

export const ExtractedFactSchema = z.object({
  key: z.enum(FACT_KEYS),
  value: z.string().min(1),
  source: z.enum(['stated', 'inferred']).default('stated'),
  confidence: z.number().min(0).max(1).default(0.8),
})
export type ExtractedFact = z.infer<typeof ExtractedFactSchema>

export const ExtractionSchema = z.object({
  facts: z.array(ExtractedFactSchema).default([]),
  /** Facts previously stored that the customer contradicted/updated */
  invalidatedKeys: z.array(z.enum(FACT_KEYS)).default([]),
})
export type Extraction = z.infer<typeof ExtractionSchema>

export const AgentActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('handoff'), reason: z.string() }),
  z.object({ type: z.literal('schedule_followup'), hours: z.number().positive(), reason: z.string() }),
  z.object({ type: z.literal('set_stage'), stage: z.string(), reason: z.string().optional() }),
  z.object({ type: z.literal('recommend_product'), productSlug: z.string() }),
  z.object({ type: z.literal('create_task'), title: z.string(), kind: z.string().optional() }),
  z.object({ type: z.literal('do_not_contact_until'), isoDate: z.string() }),
  /** Only valid when isoStart matches a slot previously returned by the calendar tool */
  z.object({ type: z.literal('book_appointment'), isoStart: z.string(), kind: z.enum(['visit', 'trial_class', 'meeting', 'call']).default('visit') }),
  /** Moves the lead's upcoming appointment; isoStart must match a slot returned by the calendar tool */
  z.object({ type: z.literal('reschedule_appointment'), isoStart: z.string() }),
  /** Cancels the lead's upcoming appointment (the agent should offer to rebook) */
  z.object({ type: z.literal('cancel_appointment'), reason: z.string().optional() }),
])
export type AgentAction = z.infer<typeof AgentActionSchema>

export const GenerationSchema = z.object({
  reply: z.string(),
  actions: z.array(AgentActionSchema).default([]),
  /** ids of knowledge chunks or catalog entries the reply relied on */
  usedSources: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.7),
  nextBestAction: z.string().optional(),
})
export type Generation = z.infer<typeof GenerationSchema>

export const ValidationIssueSchema = z.object({
  code: z.string(),
  severity: z.enum(['info', 'warn', 'block']),
  message: z.string(),
})
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>

export const ValidationResultSchema = z.object({
  ok: z.boolean(),
  issues: z.array(ValidationIssueSchema),
  rewrittenReply: z.string().optional(),
})
export type ValidationResult = z.infer<typeof ValidationResultSchema>

export const EvaluationScoresSchema = z.object({
  accuracy: z.number().min(0).max(10),
  grounding: z.number().min(0).max(10),
  sales_quality: z.number().min(0).max(10),
  tone: z.number().min(0).max(10),
  qualification_quality: z.number().min(0).max(10),
  conversion_attempt: z.number().min(0).max(10),
  customer_effort: z.number().min(0).max(10),
  repetition: z.number().min(0).max(10),
  hallucination: z.number().min(0).max(10),
  compliance: z.number().min(0).max(10),
})
export type EvaluationScores = z.infer<typeof EvaluationScoresSchema>

export const CopilotSuggestionSchema = z.object({
  suggestedReply: z.string(),
  detectedObjection: z.string().nullable().default(null),
  nextBestAction: z.string(),
  summary: z.string(),
  crmUpdates: z.array(z.object({ key: z.string(), value: z.string() })).default([]),
})
export type CopilotSuggestion = z.infer<typeof CopilotSuggestionSchema>

export const AgentDecision = ['reply', 'handoff', 'silent', 'template_required', 'blocked'] as const
export type AgentDecisionKind = (typeof AgentDecision)[number]
