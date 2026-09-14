import type { Db } from '@vox/db'
import type {
  AgentAction,
  Classification,
  Extraction,
  Generation,
  SalesBrain,
  ValidationResult,
} from '@vox/shared'
import type { Logger } from '../logger.js'
import type { Providers } from '../providers/index.js'
import type { PromptRegistry } from '../prompts/registry.js'
import type { ResolvedAgentSettings } from '../settings/agent-settings.js'
import type { AgentCatalog } from '../catalog/product-service.js'
import type { SearchHit } from '../knowledge/search-service.js'
import type { AvailableSlot } from '../providers/calendar.js'
import type { TraceHandle } from '../providers/trace.js'

export interface AgentDeps {
  db: Db
  providers: Providers
  logger: Logger
  prompts: PromptRegistry
  /** Pre-resolves tenant-scoped providers (CRM-managed credentials) before work runs under `runWithTenant`. */
  warmTenant?: (tenantId: string) => Promise<void>
}

export interface AgentRunInput {
  tenantId: string
  unitId: string
  conversationId: string
  /** The inbound message that triggered this run (null for playground/simulated inputs without persistence) */
  inboundMessageId?: string | null
  text: string
  kind: 'reply' | 'playground' | 'followup'
  env?: 'production' | 'staging'
  overrides?: { promptVersion?: number; model?: string; persona?: string }
  /** When true, no outbound message is sent and CRM side effects are limited (playground). */
  dryRun?: boolean
}

export interface MemorySnapshot {
  contact: {
    id: string
    name: string | null
    firstName: string | null
    phone: string | null
    email: string | null
    profileType: string | null
    source: string | null
    city: string | null
    company?: { name: string } | null
  }
  lead: {
    id: string
    stageKey: string
    stageName: string
    score: number
    ownerId: string | null
    interestProductId: string | null
    recommendedProductId: string | null
    doNotContactUntil: Date | null
    createdAt: Date
  } | null
  conversation: {
    id: string
    mode: string
    summary: string | null
    lastInboundAt: Date | null
    channelKind: string
    channelId: string
    contactId: string
    unitId: string
    leadId: string | null
  }
  recent: Array<{
    id: string
    direction: 'inbound' | 'outbound'
    authorType: string
    text: string
    createdAt: Date
  }>
  facts: Array<{ id: string; key: string; value: string; source: string; confidence: number }>
  inboundCount: number
  outboundCount: number
  appointmentsCount: number
  consecutiveBlockedRuns: number
  optedOut: boolean
}

export interface StepRecord {
  name: string
  ms: number
  model?: string
  tokensIn?: number
  tokensOut?: number
  costUsd?: number
  skipped?: boolean
  note?: string
}

/** Mutable pipeline state shared by steps. */
export interface AgentContext {
  input: AgentRunInput
  deps: AgentDeps
  runId: string
  startedAt: number
  trace: TraceHandle
  settings: ResolvedAgentSettings
  unit: { id: string; name: string; city: string | null; timezone: string }
  salesBrain: SalesBrain
  salesBrainVersion: number
  promptVersions: Record<string, number>
  text: string // normalized customer text
  memory: MemorySnapshot
  classification: Classification | null
  extraction: Extraction | null
  catalog: AgentCatalog | null
  knowledge: SearchHit[]
  retrievalConfidence: number
  slots: AvailableSlot[] | null
  generation: Generation | null
  validation: ValidationResult | null
  finalReply: string | null
  actions: AgentAction[]
  decision: 'reply' | 'handoff' | 'silent' | 'template_required' | 'blocked'
  decisionReason: string | null
  confidence: number
  steps: StepRecord[]
  usage: { inputTokens: number; outputTokens: number; costUsd: number }
  model: string | null
  handoffReason: string | null
  stageSuggestion: string | null
  toolCalls: Array<{ name: string; input: unknown; output: unknown; ms: number; error?: string }>
}

export interface AgentRunResult {
  runId: string
  decision: AgentContext['decision']
  decisionReason: string | null
  reply: string | null
  actions: AgentAction[]
  classification: Classification | null
  extraction: Extraction | null
  validation: ValidationResult | null
  confidence: number
  retrievalConfidence: number
  sourceIds: string[]
  knowledge: Array<{ chunkId: string; title: string; score: number }>
  catalogUsed: boolean
  slots: AvailableSlot[] | null
  steps: StepRecord[]
  usage: AgentContext['usage']
  latencyMs: number
  model: string | null
  handoffReason: string | null
  outboundMessageId: string | null
  leadId: string | null
  score: number | null
  scoreReasons: string[]
  stage: string | null
  nextBestAction: string | null
  followUpAt: Date | null
}
