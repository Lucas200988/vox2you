import { SignJWT, jwtVerify } from 'jose'
import type { Db } from '@vox/db'
import { randomToken, sha256, type Role } from '@vox/shared'
import { UnauthorizedError } from '@vox/core'

export interface AccessClaims {
  sub: string
  tid: string
  role: Role
  units: string[]
  name: string
  email: string
}

export class TokenService {
  private readonly key: Uint8Array
  constructor(
    private readonly db: Db,
    secret: string,
    private readonly accessTtlSec: number,
    private readonly refreshTtlDays: number,
  ) {
    this.key = new TextEncoder().encode(secret)
  }

  async signAccess(claims: AccessClaims): Promise<string> {
    return new SignJWT({ tid: claims.tid, role: claims.role, units: claims.units, name: claims.name, email: claims.email })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setIssuedAt()
      .setIssuer('vox-platform')
      .setExpirationTime(`${this.accessTtlSec}s`)
      .sign(this.key)
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    try {
      const { payload } = await jwtVerify(token, this.key, { issuer: 'vox-platform' })
      return { sub: payload.sub!, tid: payload['tid'] as string, role: payload['role'] as Role, units: (payload['units'] as string[]) ?? [], name: payload['name'] as string, email: payload['email'] as string }
    } catch {
      throw new UnauthorizedError('Invalid or expired token')
    }
  }

  /** Opaque refresh token; only the hash is stored. Rotation keeps a family id for reuse detection. */
  async issueRefresh(userId: string, family?: string, meta: { userAgent?: string; ip?: string } = {}): Promise<{ token: string; family: string }> {
    const token = randomToken(48)
    const fam = family ?? crypto.randomUUID()
    await this.db.refreshToken.create({ data: { userId, tokenHash: sha256(token), family: fam, expiresAt: new Date(Date.now() + this.refreshTtlDays * 864e5), userAgent: meta.userAgent ?? null, ip: meta.ip ?? null } })
    return { token, family: fam }
  }

  async rotateRefresh(token: string, meta: { userAgent?: string; ip?: string } = {}): Promise<{ userId: string; token: string }> {
    const row = await this.db.refreshToken.findUnique({ where: { tokenHash: sha256(token) } })
    if (!row) throw new UnauthorizedError('Invalid refresh token')
    if (row.revokedAt) {
      // reuse of a rotated token → revoke the whole family
      await this.db.refreshToken.updateMany({ where: { family: row.family, revokedAt: null }, data: { revokedAt: new Date() } })
      throw new UnauthorizedError('Refresh token reuse detected')
    }
    if (row.expiresAt < new Date()) throw new UnauthorizedError('Refresh token expired')
    await this.db.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } })
    const next = await this.issueRefresh(row.userId, row.family, meta)
    return { userId: row.userId, token: next.token }
  }

  async revokeRefresh(token: string): Promise<void> {
    await this.db.refreshToken.updateMany({ where: { tokenHash: sha256(token), revokedAt: null }, data: { revokedAt: new Date() } })
  }
}
