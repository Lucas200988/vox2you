import type { Logger, Providers } from '@vox/core'
import { createProvidersFromEnv, type ProviderEnv, type ProviderStatus } from './factory.js'

export interface ResolvedProviders {
  providers: Providers
  status: ProviderStatus
}

interface CacheEntry extends ResolvedProviders {
  overridesKey: string
  expires: number
}

export interface TenantProviderResolverOptions {
  /** Process environment: the fallback for anything the tenant did not configure in the CRM. */
  baseEnv: ProviderEnv
  base: ResolvedProviders
  /** Env-shaped overrides built from the tenant's stored integrations (see IntegrationService.envOverrides). */
  loadOverrides: (tenantId: string) => Promise<Record<string, string>>
  logger?: Logger
  ttlMs?: number
}

/**
 * Builds and caches a provider set per tenant from CRM-managed credentials layered over `.env`.
 * Credentials never leave the process: the cache key is a hash-free JSON string kept in memory only.
 */
export class TenantProviderResolver {
  private readonly cache = new Map<string, CacheEntry>()
  private readonly ttl: number

  constructor(private readonly opts: TenantProviderResolverOptions) {
    this.ttl = opts.ttlMs ?? 60_000
  }

  async resolve(tenantId: string): Promise<ResolvedProviders> {
    const now = Date.now()
    const hit = this.cache.get(tenantId)
    if (hit && hit.expires > now) return hit
    let overrides: Record<string, string> = {}
    try {
      overrides = await this.opts.loadOverrides(tenantId)
    } catch (err) {
      this.opts.logger?.warn(
        { err, tenantId },
        'could not load tenant integrations; using process env',
      )
      if (hit) return hit
    }
    const overridesKey = JSON.stringify(overrides)
    if (hit && hit.overridesKey === overridesKey) {
      hit.expires = now + this.ttl
      return hit
    }
    const built = Object.keys(overrides).length
      ? createProvidersFromEnv({ ...this.opts.baseEnv, ...overrides }, this.opts.logger)
      : this.opts.base
    const entry: CacheEntry = { ...built, overridesKey, expires: now + this.ttl }
    this.cache.set(tenantId, entry)
    if (Object.keys(overrides).length)
      this.opts.logger?.info(
        { tenantId, status: built.status },
        'tenant providers resolved from CRM integrations',
      )
    return entry
  }

  /** Synchronous lookup for the ambient-tenant proxy; tolerates a stale entry (refreshed by the next resolve). */
  peek(tenantId: string): ResolvedProviders | undefined {
    return this.cache.get(tenantId)
  }

  invalidate(tenantId?: string): void {
    if (tenantId) this.cache.delete(tenantId)
    else this.cache.clear()
  }
}

/**
 * A `Providers` facade that transparently serves the ambient tenant's provider set (when one was
 * resolved) and falls back to the process-wide providers otherwise. Property access is evaluated
 * on every use, so long-lived holders (services, orchestrator) need no changes.
 */
export function tenantAwareProviders(
  base: Providers,
  resolver: TenantProviderResolver,
  currentTenant: () => string | undefined,
): Providers {
  const pick = (): Providers => {
    const tenantId = currentTenant()
    const hit = tenantId ? resolver.peek(tenantId) : undefined
    return hit?.providers ?? base
  }
  return new Proxy(base, {
    get: (_target, prop) => (pick() as unknown as Record<string | symbol, unknown>)[prop],
    has: (_target, prop) => prop in pick(),
    ownKeys: () => Reflect.ownKeys(pick()),
    getOwnPropertyDescriptor: (_target, prop) => {
      const d = Object.getOwnPropertyDescriptor(pick(), prop)
      return d ? { ...d, configurable: true } : undefined
    },
  })
}
