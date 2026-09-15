import fp from 'fastify-plugin'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { sha256 } from '@vox/shared'
import {
  enterTenant,
  ForbiddenError,
  UnauthorizedError,
  hasPermission,
  type Permission,
  type TenantContext,
} from '@vox/core'
import type { AppContext } from '../context.js'
import { TokenService } from '../auth/tokens.js'

declare module 'fastify' {
  interface FastifyRequest {
    auth: TenantContext | null
    apiKeyScopes: string[] | null
  }
  interface FastifyInstance {
    ctx: AppContext
    tokens: TokenService
    requireAuth: (
      permission?: Permission,
    ) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>
    requireScope: (scope: string) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

export default fp(async (app, opts: { ctx: AppContext }) => {
  const { ctx } = opts
  const tokens = new TokenService(
    ctx.db,
    ctx.config.JWT_SECRET,
    ctx.config.ACCESS_TOKEN_TTL_SECONDS,
    ctx.config.REFRESH_TOKEN_TTL_DAYS,
  )
  app.decorate('ctx', ctx)
  app.decorate('tokens', tokens)
  app.decorateRequest('auth', null)
  app.decorateRequest('apiKeyScopes', null)

  app.addHook('onRequest', async (req) => {
    const header = req.headers.authorization
    const apiKey = req.headers['x-api-key']
    if (header?.startsWith('Bearer ')) {
      const claims = await tokens.verifyAccess(header.slice(7)).catch(() => null)
      if (claims)
        req.auth = {
          tenantId: claims.tid,
          unitIds: claims.units,
          userId: claims.sub,
          role: claims.role,
          actor: `user:${claims.sub}`,
        }
    } else if (typeof apiKey === 'string' && apiKey.length > 10) {
      const row = await ctx.db.apiKey.findUnique({ where: { keyHash: sha256(apiKey) } })
      if (row && !row.revokedAt && (!row.expiresAt || row.expiresAt > new Date())) {
        req.auth = {
          tenantId: row.tenantId,
          unitIds: row.unitIds,
          role: 'apikey',
          actor: `apikey:${row.id}`,
        }
        req.apiKeyScopes = row.scopes
        void ctx.db.apiKey
          .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
          .catch(() => undefined)
      }
    }
    if (req.auth) {
      // Bind the request to its tenant so `ctx.providers` serves the tenant's CRM-configured credentials
      enterTenant(req.auth.tenantId)
      await ctx.resolver.resolve(req.auth.tenantId)
    }
  })

  // Units of each tenant (60s cache): a `unitId` in the query/body/params must belong to the caller's
  // tenant, whatever the role, so a foreign unit id can never select data or scope a write.
  const unitCache = new Map<string, { ids: Set<string>; expires: number }>()
  const tenantUnitIds = async (tenantId: string): Promise<Set<string>> => {
    const hit = unitCache.get(tenantId)
    if (hit && hit.expires > Date.now()) return hit.ids
    const rows = await ctx.db.unit.findMany({ where: { tenantId }, select: { id: true } })
    const ids = new Set(rows.map((r) => r.id))
    unitCache.set(tenantId, { ids, expires: Date.now() + 60_000 })
    return ids
  }
  const assertUnitInTenant = async (req: FastifyRequest, auth: TenantContext) => {
    const candidates = [req.query, req.body, req.params]
      .map((src) => (src as { unitId?: unknown } | null | undefined)?.unitId)
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
    if (!candidates.length) return
    let ids = await tenantUnitIds(auth.tenantId)
    for (const unitId of candidates) {
      if (!ids.has(unitId)) {
        // a unit created seconds ago may not be cached yet: refresh once before refusing
        unitCache.delete(auth.tenantId)
        ids = await tenantUnitIds(auth.tenantId)
        if (!ids.has(unitId)) throw new ForbiddenError('No access to this unit')
      }
    }
  }

  app.decorate('requireAuth', (permission?: Permission) => async (req: FastifyRequest) => {
    if (!req.auth) throw new UnauthorizedError()
    if (permission && req.auth.role !== 'apikey' && !hasPermission(req.auth.role, permission))
      throw new ForbiddenError(`Missing permission ${permission}`)
    if (permission && req.auth.role === 'apikey')
      throw new ForbiddenError('API keys cannot access this endpoint')
    await assertUnitInTenant(req, req.auth)
  })

  app.decorate('requireScope', (scope: string) => async (req: FastifyRequest) => {
    if (!req.auth) throw new UnauthorizedError()
    if (req.auth.role === 'apikey' && !req.apiKeyScopes?.includes(scope))
      throw new ForbiddenError(`Missing scope ${scope}`)
  })
})
