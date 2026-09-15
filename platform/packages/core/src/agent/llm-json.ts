import { z } from 'zod'
import { safeJsonParse } from '@vox/shared'
import type { LLMProvider, LLMResponse } from '../providers/llm.js'

export interface JsonCallResult<T> {
  data: T | null
  response: LLMResponse
  parseError?: string
}

/**
 * Structured LLM call: requests JSON conforming to a Zod schema (via provider-native structured
 * output when supported) and validates. One automatic retry on invalid JSON.
 */
export async function callJson<S extends z.ZodTypeAny>(
  llm: LLMProvider,
  params: { model: string; task: string; system?: string; user: string; schema: S; schemaName: string; maxTokens?: number; temperature?: number; metadata?: Record<string, string> },
): Promise<JsonCallResult<z.infer<S>>> {
  const jsonSchema = z.toJSONSchema(params.schema, { target: 'draft-7', unrepresentable: 'any' }) as Record<string, unknown>
  const first = await llm.complete({
    model: params.model,
    task: params.task,
    system: params.system,
    messages: [{ role: 'user', content: params.user }],
    maxTokens: params.maxTokens ?? 1024,
    temperature: params.temperature ?? 0.2,
    jsonSchema: { name: params.schemaName, schema: jsonSchema },
    metadata: params.metadata,
  })
  const parsed = tryParse(params.schema, first)
  if (parsed.success) return { data: parsed.data, response: first }

  const retry = await llm.complete({
    model: params.model,
    task: params.task,
    system: params.system,
    messages: [
      { role: 'user', content: params.user },
      { role: 'assistant', content: first.text || '{}' },
      { role: 'user', content: `A resposta anterior não é um JSON válido para o schema (${parsed.error}). Responda SOMENTE com o JSON corrigido.` },
    ],
    maxTokens: params.maxTokens ?? 1024,
    temperature: 0,
    jsonSchema: { name: params.schemaName, schema: jsonSchema },
    metadata: params.metadata,
  })
  const merged: LLMResponse = {
    ...retry,
    usage: { inputTokens: first.usage.inputTokens + retry.usage.inputTokens, outputTokens: first.usage.outputTokens + retry.usage.outputTokens },
    costUsd: first.costUsd + retry.costUsd,
    latencyMs: first.latencyMs + retry.latencyMs,
  }
  const second = tryParse(params.schema, retry)
  return second.success ? { data: second.data, response: merged } : { data: null, response: merged, parseError: second.error }
}

function tryParse<S extends z.ZodTypeAny>(schema: S, res: LLMResponse): { success: true; data: z.infer<S> } | { success: false; error: string } {
  const raw = res.json ?? safeJsonParse(res.text)
  if (raw === null || raw === undefined) return { success: false, error: 'no JSON found' }
  const parsed = schema.safeParse(raw)
  if (parsed.success) return { success: true, data: parsed.data }
  return { success: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
}
