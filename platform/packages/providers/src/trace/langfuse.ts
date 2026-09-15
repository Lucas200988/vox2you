import { Langfuse } from 'langfuse'
import type { GenerationEnd, SpanEnd, SpanInput, TraceContext, TraceHandle, TraceSink } from '@vox/core'

export interface LangfuseConfig {
  publicKey: string
  secretKey: string
  baseUrl?: string
  /** Mask PII before shipping (phone/email patterns) */
  maskPii?: boolean
}

/** Langfuse trace sink. PENDING credential: LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY. */
export class LangfuseTraceSink implements TraceSink {
  readonly name = 'langfuse'
  private readonly client: Langfuse

  constructor(private readonly cfg: LangfuseConfig) {
    this.client = new Langfuse({ publicKey: cfg.publicKey, secretKey: cfg.secretKey, baseUrl: cfg.baseUrl, flushAt: 10, flushInterval: 2000 })
  }

  startTrace(ctx: TraceContext): TraceHandle {
    const mask = this.cfg.maskPii ?? true
    const trace = this.client.trace({
      id: ctx.traceId,
      name: ctx.name,
      sessionId: ctx.conversationId,
      userId: ctx.leadId ?? ctx.userId,
      tags: [ctx.tenantId, ...(ctx.unitId ? [ctx.unitId] : [])],
      metadata: { tenantId: ctx.tenantId, unitId: ctx.unitId, conversationId: ctx.conversationId, leadId: ctx.leadId, messageId: ctx.messageId, ...ctx.metadata },
    })
    return {
      traceId: ctx.traceId,
      span: (input: SpanInput) => {
        const span = trace.span({ name: input.name, input: maskValue(input.input, mask), metadata: input.metadata })
        return { end: (data?: SpanEnd) => span.end({ output: maskValue(data?.output, mask), level: data?.level, statusMessage: data?.statusMessage, metadata: data?.metadata }) }
      },
      generation: (input) => {
        const gen = trace.generation({ name: input.name, model: input.model, input: maskValue(input.input, mask), metadata: input.metadata })
        return {
          end: (data?: GenerationEnd) =>
            gen.end({ output: maskValue(data?.output, mask), model: data?.model, level: data?.level, statusMessage: data?.statusMessage, usage: data?.usage ? { input: data.usage.inputTokens, output: data.usage.outputTokens, totalCost: data.costUsd } : undefined, metadata: { ...data?.metadata, provider: data?.provider, promptVersion: data?.promptVersion } }),
        }
      },
      event: (name, data) => {
        trace.event({ name, metadata: data })
      },
      score: (name, value, comment) => {
        trace.score({ name, value, comment })
      },
      end: (data) => trace.update({ output: maskValue(data?.output, mask), metadata: data?.metadata }),
    }
  }

  async flush(): Promise<void> {
    await this.client.flushAsync()
  }
}

const PHONE_RE = /\+?\d{2}\s?\(?\d{2}\)?\s?9?\d{4}-?\d{4}/g
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g

function maskValue(v: unknown, mask: boolean): unknown {
  if (!mask || v === undefined || v === null) return v
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  const masked = s.replace(PHONE_RE, '[phone]').replace(EMAIL_RE, '[email]')
  if (typeof v === 'string') return masked
  try {
    return JSON.parse(masked)
  } catch {
    return masked
  }
}
