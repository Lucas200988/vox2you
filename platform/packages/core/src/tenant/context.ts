import type { Role } from '@vox/shared'
import { ForbiddenError } from '../errors.js'

/**
 * Every service call carries a TenantContext. Repositories add `tenantId` filters from it;
 * nothing in core reads data without one.
 */
export interface TenantContext {
  tenantId: string
  /** Units the actor can access. Empty array = all units of the tenant (owner/admin). */
  unitIds: string[]
  userId?: string
  role: Role | 'system' | 'apikey'
  actor: string // user:<id> | system | agent | apikey:<id> | automation:<id>
}

export function systemContext(tenantId: string, actor = 'system'): TenantContext {
  return { tenantId, unitIds: [], role: 'system', actor }
}

export function agentContext(tenantId: string): TenantContext {
  return { tenantId, unitIds: [], role: 'system', actor: 'agent' }
}

export function canAccessUnit(ctx: TenantContext, unitId: string): boolean {
  if (ctx.role === 'system' || ctx.role === 'owner' || ctx.role === 'admin') return true
  if (ctx.unitIds.length === 0) return true
  return ctx.unitIds.includes(unitId)
}

export function assertUnitAccess(ctx: TenantContext, unitId: string): void {
  if (!canAccessUnit(ctx, unitId)) throw new ForbiddenError('No access to this unit')
}

export function assertTenant(
  ctx: TenantContext,
  entity: { tenantId: string } | null | undefined,
  name = 'Resource',
): void {
  if (!entity || entity.tenantId !== ctx.tenantId)
    throw new ForbiddenError(`${name} belongs to another tenant`)
}

/** Prisma where-fragment restricting to accessible units. */
export function unitScope(ctx: TenantContext): { unitId?: { in: string[] } } {
  if (
    ctx.unitIds.length === 0 ||
    ctx.role === 'system' ||
    ctx.role === 'owner' ||
    ctx.role === 'admin'
  )
    return {}
  return { unitId: { in: ctx.unitIds } }
}

// ─── Ambient tenant (AsyncLocalStorage) ───────────────────────────────────────
// Lets tenant-scoped infrastructure (provider credentials resolved from the CRM) be picked up by
// code that only receives a `Providers` object: API requests enter the tenant after auth, the inbound
// processor after channel resolution, worker jobs after loading their row.
import { AsyncLocalStorage } from 'node:async_hooks'

const tenantStore = new AsyncLocalStorage<{ tenantId: string }>()

export function runWithTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return tenantStore.run({ tenantId }, fn)
}

/**
 * Same scope for callback-style frameworks: `fn` and everything it starts run under the tenant.
 *
 * Fastify is the reason this exists instead of an `enterWith` helper. It chains hooks with
 * `hookResult.then(done, done)`, and that continuation is created *before* the hook body runs, so a
 * store entered with `enterWith` inside an async `onRequest` hook is already gone by the time the
 * route handler executes — the request would silently fall back to the process-wide providers (the
 * mock LLM) even with the tenant's credentials resolved. Running the rest of the lifecycle inside
 * `run()` keeps the scope for every promise created from there on.
 */
export function runWithTenantSync<T>(tenantId: string, fn: () => T): T {
  return tenantStore.run({ tenantId }, fn)
}

export function currentTenantId(): string | undefined {
  return tenantStore.getStore()?.tenantId
}
