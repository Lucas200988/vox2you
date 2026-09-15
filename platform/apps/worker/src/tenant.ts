import { runWithTenant } from '@vox/core'
import type { WorkerContext } from './main.js'

/** Runs a job under its tenant so `ctx.providers` serves the tenant's CRM-configured credentials. */
export async function withTenant<T>(
  ctx: WorkerContext,
  tenantId: string | null | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  if (!tenantId) return fn()
  await ctx.deps.warmTenant?.(tenantId)
  return runWithTenant(tenantId, fn)
}

export const tenantOf = {
  followUp: (ctx: WorkerContext, id: string) =>
    ctx.db.followUp
      .findUnique({ where: { id }, select: { tenantId: true } })
      .then((r) => r?.tenantId),
  document: (ctx: WorkerContext, id: string) =>
    ctx.db.knowledgeDocument
      .findUnique({ where: { id }, select: { tenantId: true } })
      .then((r) => r?.tenantId),
  event: (ctx: WorkerContext, id: string) =>
    ctx.db.domainEvent
      .findUnique({ where: { id }, select: { tenantId: true } })
      .then((r) => r?.tenantId),
}
