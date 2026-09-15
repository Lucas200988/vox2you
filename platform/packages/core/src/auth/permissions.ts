import { ROLE_RANK, type Role } from '@vox/shared'
import { ForbiddenError } from '../errors.js'
import type { TenantContext } from '../tenant/context.js'

export const PERMISSIONS = {
  'inbox:read': 'viewer',
  'inbox:write': 'seller',
  'contacts:read': 'viewer',
  'contacts:write': 'seller',
  'contacts:export': 'manager',
  'contacts:delete': 'admin',
  'leads:read': 'viewer',
  'leads:write': 'seller',
  'leads:assign': 'manager',
  'products:read': 'viewer',
  'products:write': 'manager',
  'knowledge:read': 'viewer',
  'knowledge:write': 'manager',
  'knowledge:publish': 'manager',
  'prompts:read': 'manager',
  'prompts:write': 'admin',
  'prompts:publish': 'admin',
  'settings:read': 'manager',
  'settings:write': 'admin',
  'users:read': 'manager',
  'users:write': 'admin',
  'analytics:read': 'manager',
  'audit:read': 'admin',
  'playground:use': 'manager',
  'campaigns:read': 'manager',
  'campaigns:write': 'manager',
  'integrations:write': 'admin',
  'tenant:manage': 'owner',
} as const satisfies Record<string, Role>

export type Permission = keyof typeof PERMISSIONS

export function hasPermission(role: TenantContext['role'], permission: Permission): boolean {
  if (role === 'system') return true
  if (role === 'apikey') return false // api keys use scopes, checked separately
  const required = PERMISSIONS[permission]
  return ROLE_RANK[role] >= ROLE_RANK[required]
}

export function requirePermission(ctx: TenantContext, permission: Permission): void {
  if (!hasPermission(ctx.role, permission)) throw new ForbiddenError(`Missing permission ${permission}`)
}
