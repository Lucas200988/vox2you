export interface Stage {
  id: string
  key: string
  name: string
  order: number
  kind: string
  probability: number
  color: string | null
  maxHoursInStage?: number | null
}

export interface ConversationListItem {
  id: string
  unitId: string
  mode: 'ai' | 'human' | 'paused'
  status: string
  unreadCount: number
  lastMessageAt: string | null
  lastMessagePreview: string | null
  lastInboundAt: string | null
  windowRemainingMin: number
  handoffReason: string | null
  contact: {
    id: string
    name: string | null
    phone: string | null
    profileType: string | null
    source: string | null
  }
  lead: {
    id: string
    score: number
    stage: { key: string; name: string; color: string | null }
    interestProduct: { name: string } | null
    owner: { id: string; name: string } | null
  } | null
  assignee: { id: string; name: string } | null
  channel: { kind: string; name: string }
}

export interface Fact {
  id: string
  key: string
  value: string
  source: string
  status?: string
  confidence: number
}

export interface Message {
  id: string
  direction: 'inbound' | 'outbound'
  type: string
  authorType: string
  text: string | null
  transcript: string | null
  status: string
  templateName: string | null
  createdAt: string
  errorTitle: string | null
  authorUser: { id: string; name: string } | null
  agentRun: {
    id: string
    confidence: number | null
    decision: string | null
    sourceIds: string[]
    costUsd: string | number
    latencyMs: number
    model: string | null
  } | null
  attachments: Array<{ id: string; kind: string; mimeType: string | null; fileName: string | null }>
}

export interface ConversationDetail extends Omit<ConversationListItem, 'contact' | 'lead'> {
  summary: string | null
  sentiment: string | null
  handoffSummary: Record<string, unknown> | null
  contact: {
    id: string
    name: string | null
    phone: string | null
    email: string | null
    city: string | null
    profileType: string | null
    source: string | null
    company: { name: string } | null
    consents: Array<{ purpose: string; status: string }>
  }
  lead: {
    id: string
    score: number
    scoreBreakdown: Array<{ key: string; points: number; explanation: string }>
    nextBestAction: string | null
    nextFollowupAt: string | null
    nextFollowupReason: string | null
    probability: number
    urgency: string | null
    stage: Stage
    facts: Fact[]
    interestProduct: { id: string; name: string } | null
    recommendedProduct: { id: string; name: string } | null
    owner: { id: string; name: string } | null
    tags: Array<{ tag: { id: string; name: string } }>
  } | null
  unit: { id: string; name: string; timezone: string }
}

export interface AgentRunRow {
  id: string
  kind: string
  status: string
  decision: string | null
  decisionReason: string | null
  confidence: number | null
  retrievalScore: number | null
  model: string | null
  inputTokens: number
  outputTokens: number
  costUsd: string | number
  latencyMs: number
  createdAt: string
  classification: { intent: string; signals: string[]; sentiment: string; urgency: string } | null
  extractedFacts: { facts: Array<{ key: string; value: string; source: string }> } | null
  validation: {
    ok: boolean
    issues: Array<{ code: string; severity: string; message: string }>
  } | null
  retrieval: { hits?: Array<{ chunkId: string; title: string; score: number }> } | null
  steps: Array<{
    name: string
    ms: number
    model?: string
    tokensIn?: number
    tokensOut?: number
    skipped?: boolean
  }>
  promptVersions: Record<string, number>
  replyText: string | null
  toolCalls: Array<{
    id: string
    name: string
    input: unknown
    output: unknown
    error: string | null
    durationMs: number
  }>
}

export interface CatalogProduct {
  id: string
  slug: string
  name: string
  category: string
  modality: string | null
  shortDescription: string | null
  offers: Array<{
    id: string
    name: string
    listPrice: number
    promoPrice: number | null
    installmentsMax: number | null
    installmentValue: number | null
    conditions: string | null
    display: string
    validTo: string | null
  }>
  classes: Array<{
    id: string
    name: string
    startsOn: string
    weekdays: string[]
    startTime: string
    endTime: string
    seatsLeft: number
    status: string
  }>
}
