import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { LoginSchema, type Role } from '@vox/shared'
import { UnauthorizedError, verifyPassword } from '@vox/core'

export const authRoutes: FastifyPluginAsync = async (app) => {
  const loginLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }

  app.post('/login', { schema: { tags: ['auth'], security: [], body: LoginSchema }, ...loginLimit }, async (req) => {
    const { email, password } = req.body as z.infer<typeof LoginSchema>
    const user = await app.ctx.db.user.findFirst({ where: { email: email.toLowerCase(), status: 'active' }, include: { units: true, tenant: { select: { slug: true, name: true, status: true } } } })
    if (!user || user.tenant.status !== 'active' || !(await verifyPassword(password, user.passwordHash))) throw new UnauthorizedError('Credenciais inválidas')
    const units = user.units.map((u) => u.unitId)
    const accessToken = await app.tokens.signAccess({ sub: user.id, tid: user.tenantId, role: user.role as Role, units, name: user.name, email: user.email })
    const refresh = await app.tokens.issueRefresh(user.id, undefined, { userAgent: req.headers['user-agent'], ip: req.ip })
    await app.ctx.db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    await app.ctx.db.auditLog.create({ data: { tenantId: user.tenantId, userId: user.id, actor: `user:${user.id}`, action: 'auth.login', entityType: 'user', entityId: user.id, ip: req.ip, userAgent: req.headers['user-agent'] ?? null } })
    return { accessToken, refreshToken: refresh.token, expiresIn: app.ctx.config.ACCESS_TOKEN_TTL_SECONDS, user: { id: user.id, name: user.name, email: user.email, role: user.role, tenantId: user.tenantId, tenant: user.tenant, unitIds: units } }
  })

  app.post('/refresh', { schema: { tags: ['auth'], security: [], body: z.object({ refreshToken: z.string().min(10) }) }, ...loginLimit }, async (req) => {
    const { refreshToken } = req.body as { refreshToken: string }
    const rotated = await app.tokens.rotateRefresh(refreshToken, { userAgent: req.headers['user-agent'], ip: req.ip })
    const user = await app.ctx.db.user.findFirst({ where: { id: rotated.userId, status: 'active' }, include: { units: true } })
    if (!user) throw new UnauthorizedError()
    const accessToken = await app.tokens.signAccess({ sub: user.id, tid: user.tenantId, role: user.role as Role, units: user.units.map((u) => u.unitId), name: user.name, email: user.email })
    return { accessToken, refreshToken: rotated.token, expiresIn: app.ctx.config.ACCESS_TOKEN_TTL_SECONDS }
  })

  app.post('/logout', { schema: { tags: ['auth'], security: [], body: z.object({ refreshToken: z.string().optional() }) } }, async (req) => {
    const { refreshToken } = req.body as { refreshToken?: string }
    if (refreshToken) await app.tokens.revokeRefresh(refreshToken)
    return { ok: true }
  })

  app.get('/me', { schema: { tags: ['auth'] }, preHandler: app.requireAuth() }, async (req) => {
    const auth = req.auth!
    const user = auth.userId ? await app.ctx.db.user.findUnique({ where: { id: auth.userId }, select: { id: true, name: true, email: true, role: true, tenantId: true, avatarUrl: true, settings: true } }) : null
    const units = await app.ctx.db.unit.findMany({ where: { tenantId: auth.tenantId, ...(auth.unitIds.length && auth.role !== 'owner' && auth.role !== 'admin' ? { id: { in: auth.unitIds } } : {}) }, select: { id: true, name: true, slug: true, city: true, timezone: true } })
    return { user, units, role: auth.role, providers: app.ctx.providerStatus }
  })
}
