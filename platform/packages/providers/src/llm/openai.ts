import OpenAI from 'openai'
import type { LLMProvider, LLMRequest, LLMResponse } from '@vox/core'
import { ProviderError } from '@vox/core'
import { safeJsonParse } from '@vox/shared'
import { estimateCostUsd } from './pricing.js'

/** OpenAI chat-completions adapter (secondary provider / fallback). */
export class OpenAILLMProvider implements LLMProvider {
  readonly name = 'openai'
  private readonly client: OpenAI

  constructor(opts: { apiKey?: string; baseURL?: string } = {}) {
    this.client = new OpenAI({ apiKey: opts.apiKey, baseURL: opts.baseURL, maxRetries: 2, timeout: 60_000 })
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const started = Date.now()
    try {
      const res = await this.client.chat.completions.create({
        model: req.model,
        max_completion_tokens: req.maxTokens ?? 1024,
        temperature: req.temperature,
        messages: [...(req.system ? [{ role: 'system' as const, content: req.system }] : []), ...req.messages.map((m) => ({ role: m.role, content: m.content }))],
        ...(req.jsonSchema ? { response_format: { type: 'json_schema' as const, json_schema: { name: req.jsonSchema.name, schema: req.jsonSchema.schema } } } : {}),
        ...(req.tools?.length ? { tools: req.tools.map((t) => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.inputSchema } })) } : {}),
      })
      const choice = res.choices[0]
      const text = choice?.message.content ?? ''
      const toolCalls = (choice?.message.tool_calls ?? []).flatMap((tc) => (tc.type === 'function' ? [{ id: tc.id, name: tc.function.name, input: (safeJsonParse(tc.function.arguments) ?? {}) as Record<string, unknown> }] : []))
      const usage = { inputTokens: res.usage?.prompt_tokens ?? 0, outputTokens: res.usage?.completion_tokens ?? 0 }
      return { text, json: req.jsonSchema ? safeJsonParse(text) ?? undefined : undefined, toolCalls, usage, model: res.model, provider: this.name, latencyMs: Date.now() - started, costUsd: estimateCostUsd(res.model, usage.inputTokens, usage.outputTokens), stopReason: choice?.finish_reason ?? 'stop' }
    } catch (err) {
      if (err instanceof OpenAI.APIError) throw new ProviderError('openai', `${err.status} ${err.message}`)
      throw err
    }
  }
}
