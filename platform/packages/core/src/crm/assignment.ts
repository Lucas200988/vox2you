import type { DbTx } from '@vox/db'

export interface PickOwnerOptions {
  /** B2B leads go to managers/admins first; otherwise sellers (managers as fallback) */
  preferManager?: boolean
  /** Users that must not be picked (e.g. the previous owner when reassigning) */
  excludeUserIds?: string[]
}

/**
 * Least-loaded round-robin: among the active users of the unit with an eligible role, pick the one
 * with the fewest open leads; ties go to whoever received a lead least recently, so distribution
 * stays even when everyone is at the same load. Deterministic (no in-memory pointer), so it works
 * with several API/worker replicas.
 */
export async function pickOwner(
  tx: DbTx,
  unitId: string,
  opts: PickOwnerOptions = {},
): Promise<string | null> {
  const roles = opts.preferManager ? ['manager', 'admin', 'owner'] : ['seller', 'manager']
  const candidates = await tx.user.findMany({
    where: {
      status: 'active',
      role: { in: roles },
      units: { some: { unitId } },
      ...(opts.excludeUserIds?.length ? { id: { notIn: opts.excludeUserIds } } : {}),
    },
    select: { id: true, role: true, lastLoginAt: true },
  })
  if (!candidates.length) return null
  if (candidates.length === 1) return candidates[0]!.id

  const ids = candidates.map((c) => c.id)
  const [load, latest] = await Promise.all([
    tx.lead.groupBy({
      by: ['ownerId'],
      where: { unitId, ownerId: { in: ids }, status: 'open' },
      _count: { _all: true },
    }),
    tx.lead.groupBy({
      by: ['ownerId'],
      where: { unitId, ownerId: { in: ids } },
      _max: { updatedAt: true },
    }),
  ])
  const openBy = new Map(load.map((l) => [l.ownerId, l._count._all]))
  const lastBy = new Map(latest.map((l) => [l.ownerId, l._max.updatedAt?.getTime() ?? 0]))
  // Sellers before managers at equal load, so managers only absorb overflow in the default policy
  const rolePriority = (role: string) => (roles.indexOf(role) === -1 ? 99 : roles.indexOf(role))

  const ranked = [...candidates].sort((a, b) => {
    const byLoad = (openBy.get(a.id) ?? 0) - (openBy.get(b.id) ?? 0)
    if (byLoad !== 0) return byLoad
    const byRole = rolePriority(a.role) - rolePriority(b.role)
    if (byRole !== 0) return byRole
    const byRecency = (lastBy.get(a.id) ?? 0) - (lastBy.get(b.id) ?? 0)
    if (byRecency !== 0) return byRecency
    return a.id.localeCompare(b.id)
  })
  return ranked[0]!.id
}
