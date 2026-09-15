import type { LLMProvider, LLMRequest, LLMResponse } from '@vox/core'

interface Breaker {
  failures: number
  openedAt: number | null
}

/**
 * Tries providers in order with a simple circuit breaker (N failures → open for cooldownMs).
 * Model names are passed through; configure `modelMap` to translate models between providers.
 */
export class FallbackLLMProvider implements LLMProvider {
  readonly name = 'fallback'
  private readonly breakers = new Map<string, Breaker>()

  constructor(
    private readonly providers: LLMProvider[],
    private readonly opts: { failureThreshold?: number; cooldownMs?: number; modelMap?: Record<string, Record<string, string>>; onFallback?: (from: string, to: string, err: Error) => void } = {},
  ) {
    if (!providers.length) throw new Error('FallbackLLMProvider needs at least one provider')
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    let lastErr: Error | null = null
    for (let i = 0; i < this.providers.length; i++) {
      const p = this.providers[i]!
      const b = this.breakers.get(p.name) ?? { failures: 0, openedAt: null }
      if (b.openedAt && Date.now() - b.openedAt < (this.opts.cooldownMs ?? 60_000)) continue
      try {
        const model = this.opts.modelMap?.[p.name]?.[req.model] ?? req.model
        const res = await p.complete({ ...req, model })
        this.breakers.set(p.name, { failures: 0, openedAt: null })
        return res
      } catch (err) {
        lastErr = err as Error
        b.failures += 1
        if (b.failures >= (this.opts.failureThreshold ?? 3)) b.openedAt = Date.now()
        this.breakers.set(p.name, b)
        const next = this.providers[i + 1]
        if (next) this.opts.onFallback?.(p.name, next.name, lastErr)
      }
    }
    throw lastErr ?? new Error('All LLM providers unavailable')
  }
}
