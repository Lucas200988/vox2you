import type { GenerationEnd, SpanEnd, SpanInput, TraceContext, TraceHandle, TraceSink } from '@vox/core'
import type { Logger } from '@vox/core'

/** Logs traces via pino (debug level). Used when Langfuse is not configured. */
export class ConsoleTraceSink implements TraceSink {
  readonly name = 'console'
  constructor(private readonly logger?: Logger) {}

  startTrace(ctx: TraceContext): TraceHandle {
    const log = this.logger
    const traceId = ctx.traceId
    log?.debug({ trace: ctx }, 'trace.start')
    return {
      traceId,
      span: (input: SpanInput) => ({ end: (data?: SpanEnd) => log?.debug({ traceId, span: input.name, ...redactBig(data) }, 'trace.span') }),
      generation: (input: SpanInput & { model?: string }) => ({ end: (data?: GenerationEnd) => log?.debug({ traceId, generation: input.name, model: data?.model ?? input.model, usage: data?.usage, costUsd: data?.costUsd }, 'trace.generation') }),
      event: (name, data) => log?.debug({ traceId, event: name, ...data }, 'trace.event'),
      score: (name, value, comment) => log?.debug({ traceId, score: name, value, comment }, 'trace.score'),
      end: (data) => log?.debug({ traceId, ...redactBig(data) }, 'trace.end'),
    }
  }

  async flush(): Promise<void> {}
}

function redactBig(data?: SpanEnd): Record<string, unknown> {
  if (!data) return {}
  const out: Record<string, unknown> = { level: data.level, statusMessage: data.statusMessage, metadata: data.metadata }
  if (data.output !== undefined) {
    const s = typeof data.output === 'string' ? data.output : JSON.stringify(data.output)
    out['output'] = s.length > 300 ? `${s.slice(0, 300)}…` : data.output
  }
  return out
}
