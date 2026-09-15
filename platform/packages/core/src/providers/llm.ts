export interface LLMMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface LLMToolDefinition {
  name: string
  description: string
  /** JSON Schema for the tool input */
  inputSchema: Record<string, unknown>
}

export interface LLMToolCall {
  id: string
  name: string
  input: Record<string, unknown>
}

export interface LLMRequest {
  model: string
  system?: string
  messages: LLMMessage[]
  maxTokens?: number
  temperature?: number
  tools?: LLMToolDefinition[]
  /** Force a structured JSON response matching this schema (implemented via forced tool use or JSON mode). */
  jsonSchema?: { name: string; schema: Record<string, unknown> }
  /** Logical task name for routing/tracing/mocks: classify | extract | generate | validate | summarize | evaluate | copilot */
  task?: string
  metadata?: Record<string, string>
}

export interface LLMUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

export interface LLMResponse {
  text: string
  /** Parsed JSON when jsonSchema was requested */
  json?: unknown
  toolCalls: LLMToolCall[]
  usage: LLMUsage
  model: string
  provider: string
  latencyMs: number
  costUsd: number
  stopReason: string
}

export interface LLMProvider {
  readonly name: string
  complete(request: LLMRequest): Promise<LLMResponse>
}

export interface ModelRouting {
  classify: string
  extract: string
  generate: string
  validate: string
  summarize: string
  evaluate: string
  copilot: string
}
