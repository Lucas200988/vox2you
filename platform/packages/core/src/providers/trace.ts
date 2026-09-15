export interface TraceContext {
  traceId: string
  name: string
  tenantId: string
  unitId?: string
  conversationId?: string
  leadId?: string
  messageId?: string
  userId?: string
  metadata?: Record<string, unknown>
}

export interface SpanInput {
  name: string
  input?: unknown
  metadata?: Record<string, unknown>
}

export interface SpanEnd {
  output?: unknown
  level?: 'DEBUG' | 'DEFAULT' | 'WARNING' | 'ERROR'
  statusMessage?: string
  metadata?: Record<string, unknown>
}

export interface GenerationEnd extends SpanEnd {
  model?: string
  provider?: string
  usage?: { inputTokens: number; outputTokens: number }
  costUsd?: number
  promptVersion?: string
}

export interface SpanHandle {
  end(data?: SpanEnd): void
}

export interface GenerationHandle {
  end(data?: GenerationEnd): void
}

export interface TraceHandle {
  readonly traceId: string
  span(input: SpanInput): SpanHandle
  generation(input: SpanInput & { model?: string; promptVersion?: string }): GenerationHandle
  event(name: string, data?: Record<string, unknown>): void
  score(name: string, value: number, comment?: string): void
  end(data?: SpanEnd): void
}

export interface TraceSink {
  readonly name: string
  startTrace(ctx: TraceContext): TraceHandle
  flush(): Promise<void>
}
