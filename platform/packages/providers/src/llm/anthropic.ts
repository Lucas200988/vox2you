import Anthropic from '@anthropic-ai/sdk'
import type { LLMProvider, LLMRequest, LLMResponse } from '@vox/core'
import { ProviderError } from '@vox/core'
import { safeJsonParse } from '@vox/shared'
import { estimateCostUsd } from './pricing.js'

export interface AnthropicProviderOptions {
  apiKey?: string
  /** Effort applied to cheap tasks (classify/extract/summarize) on models that support it */
  cheapTaskEffort?: 'low' | 'medium'
  timeoutMs?: number
}

const CHEAP_TASKS = new Set(['classify', 'extract', 'summarize', 'validate'])
const SUPPORTS_EFFORT = /^claude-(opus-5|opus-4-[678]|sonnet-5|sonnet-4-6|fable)/
const SUPPORTS_TEMPERATURE = /^claude-(haiku|sonnet-4-5|opus-4-5|3)/

/**
 * Anthropic adapter. Structured output uses `output_config.format` (json_schema); when a schema is
 * rejected by the API we transparently fall back to instruction-based JSON (the prompts already
 * demand JSON) so the pipeline keeps working.
 */
export class AnthropicLLMProvider implements LLMProvider {
  readonly name = 'anthropic'
  private readonly client: Anthropic
  private readonly schemaUnsupported = new Set<string>()

  constructor(private readonly opts: AnthropicProviderOptions = {}) {
    this.client = new Anthropic({ apiKey: opts.apiKey, timeout: opts.timeoutMs ?? 60_000, maxRetries: 2 })
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const started = Date.now()
    const useSchema = !!req.jsonSchema && !this.schemaUnsupported.has(req.jsonSchema.name)
    try {
      const response = await this.create(req, useSchema)
      return this.toResponse(req, response, started)
    } catch (err) {
      if (useSchema && err instanceof Anthropic.BadRequestError && /output_config|schema|format/i.test(err.message)) {
        this.schemaUnsupported.add(req.jsonSchema!.name)
        const response = await this.create(req, false)
        return this.toResponse(req, response, started)
      }
      if (err instanceof Anthropic.APIError) throw new ProviderError('anthropic', `${err.status} ${err.message}`)
      throw err
    }
  }

  private create(req: LLMRequest, useSchema: boolean) {
    const cheap = req.task ? CHEAP_TASKS.has(req.task) : false
    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: req.model,
      max_tokens: req.maxTokens ?? 1024,
      system: req.system,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      metadata: req.metadata?.['runId'] ? { user_id: req.metadata['runId'] } : undefined,
    }
    if (req.temperature !== undefined && SUPPORTS_TEMPERATURE.test(req.model)) params.temperature = req.temperature
    if (req.tools?.length) {
      params.tools = req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema as Anthropic.Tool.InputSchema }))
    }
    const outputConfig: Record<string, unknown> = {}
    if (SUPPORTS_EFFORT.test(req.model) && cheap) outputConfig['effort'] = this.opts.cheapTaskEffort ?? 'low'
    if (useSchema && req.jsonSchema) outputConfig['format'] = { type: 'json_schema', schema: req.jsonSchema.schema }
    if (Object.keys(outputConfig).length) (params as unknown as { output_config: unknown }).output_config = outputConfig
    return this.client.messages.create(params)
  }

  private toResponse(req: LLMRequest, response: Anthropic.Message, started: number): LLMResponse {
    let text = ''
    const toolCalls: LLMResponse['toolCalls'] = []
    for (const block of response.content) {
      if (block.type === 'text') text += block.text
      else if (block.type === 'tool_use') toolCalls.push({ id: block.id, name: block.name, input: (block.input ?? {}) as Record<string, unknown> })
    }
    const usage = { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, cacheReadTokens: response.usage.cache_read_input_tokens ?? undefined, cacheWriteTokens: response.usage.cache_creation_input_tokens ?? undefined }
    return {
      text,
      json: req.jsonSchema ? safeJsonParse(text) ?? undefined : undefined,
      toolCalls,
      usage,
      model: response.model,
      provider: this.name,
      latencyMs: Date.now() - started,
      costUsd: estimateCostUsd(response.model, usage.inputTokens, usage.outputTokens),
      stopReason: response.stop_reason ?? 'end_turn',
    }
  }
}
