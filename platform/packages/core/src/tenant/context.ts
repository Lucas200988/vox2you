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

export function assertTenant(ctx: TenantContext, entity: { tenantId: string } | null | undefined, name = 'Resource'): void {
  if (!entity || entity.tenantId !== ctx.tenantId) throw new ForbiddenError(`${name} belongs to another tenant`)
}

/** Prisma where-fragment restricting to accessible units. */
export function unitScope(ctx: TenantContext): { unitId?: { in: string[] } } {
  if (ctx.unitIds.length === 0 || ctx.role === 'system' || ctx.role === 'owner' || ctx.role === 'admin') return {}
  return { unitId: { in: ctx.unitIds } }
}
