import type { Db, DbTx } from '@vox/db'
import type { ModelRouting } from '../providers/llm.js'

export interface HandoffRules {
  onHumanRequest: boolean
  onComplaint: boolean
  onEmotional: boolean
  onDiscountRequest: boolean
  onB2BComplex: boolean
  onLowConfidence: boolean
  onRepeatedFailures: number // consecutive blocked runs before handoff
  onHighScore: number | null // score threshold to notify/assign human (0 = disabled)
  keywords: string[]
}

export const DEFAULT_HANDOFF_RULES: HandoffRules = {
  onHumanRequest: true,
  onComplaint: true,
  onEmotional: true,
  onDiscountRequest: true,
  onB2BComplex: true,
  onLowConfidence: true,
  onRepeatedFailures: 2,
  onHighScore: null,
  keywords: [],
}

export interface ResolvedAgentSettings {
  unitId: string
  enabled: boolean
  agentName: string
  persona: string | null
  tone: string | null
  models: ModelRouting
  maxReplyChars: number
  maxQuestionsPerReply: number
  minConfidence: number
  autoStageTransitions: boolean
  handoffRules: HandoffRules
  businessHours: Array<{ weekday: number; start: string; end: string }>
  outOfHoursMessage: string | null
  language: string
  /** Run the LLM verifier on commercial replies (extra cost). From AgentSettings.extra.llmVerify */
  extraLlmVerify?: boolean
}

export async function loadAgentSettings(db: Db | DbTx, unitId: string, defaults: ModelRouting): Promise<ResolvedAgentSettings> {
  const row = await db.agentSettings.findUnique({ where: { unitId } })
  const models = { ...defaults, ...((row?.models as Partial<ModelRouting> | null) ?? {}) }
  const handoffRules = { ...DEFAULT_HANDOFF_RULES, ...((row?.handoffRules as Partial<HandoffRules> | null) ?? {}) }
  const bh = (row?.businessHours as { rules?: Array<{ weekday: number; start: string; end: string }> } | null)?.rules ?? []
  return {
    unitId,
    enabled: row?.enabled ?? true,
    agentName: row?.agentName ?? 'Consultor VOX2you',
    persona: row?.persona ?? null,
    tone: row?.tone ?? null,
    models,
    maxReplyChars: row?.maxReplyChars ?? 600,
    maxQuestionsPerReply: row?.maxQuestionsPerReply ?? 1,
    minConfidence: row?.minConfidence ?? 0.55,
    autoStageTransitions: row?.autoStageTransitions ?? true,
    handoffRules,
    businessHours: bh,
    outOfHoursMessage: row?.outOfHoursMessage ?? null,
    language: row?.language ?? 'pt-BR',
    extraLlmVerify: Boolean((row?.extra as { llmVerify?: boolean } | null)?.llmVerify),
  }
}
