import 'server-only'
import { cookies } from 'next/headers'

export const API_BASE = (
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:4000'
).replace(/\/$/, '')

export const ACCESS_COOKIE = 'vox_access'
export const REFRESH_COOKIE = 'vox_refresh'
export const USER_COOKIE = 'vox_user'

export interface Session {
  accessToken: string
  refreshToken: string
  expiresIn: number
  user: {
    id: string
    name: string
    email: string
    role: string
    tenantId: string
    unitIds: string[]
  }
}

const secure = process.env.NODE_ENV === 'production'

export async function setSessionCookies(
  session: Pick<Session, 'accessToken' | 'refreshToken' | 'expiresIn'> & { user?: Session['user'] },
) {
  const store = await cookies()
  store.set(ACCESS_COOKIE, session.accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: Math.max(60, session.expiresIn - 5),
  })
  store.set(REFRESH_COOKIE, session.refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 30 * 24 * 3600,
  })
  if (session.user)
    store.set(
      USER_COOKIE,
      JSON.stringify({
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        role: session.user.role,
        unitIds: session.user.unitIds,
      }),
      { httpOnly: false, sameSite: 'lax', secure, path: '/', maxAge: 30 * 24 * 3600 },
    )
}

export async function clearSessionCookies() {
  const store = await cookies()
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, USER_COOKIE]) store.delete(name)
}

/** Returns a valid access token, refreshing with the refresh cookie when needed. */
export async function getAccessToken(): Promise<string | null> {
  const store = await cookies()
  const access = store.get(ACCESS_COOKIE)?.value
  if (access) return access
  const refresh = store.get(REFRESH_COOKIE)?.value
  if (!refresh) return null
  const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: refresh }),
    cache: 'no-store',
  })
  if (!res.ok) return null
  const data = (await res.json()) as {
    accessToken: string
    refreshToken: string
    expiresIn: number
  }
  try {
    await setSessionCookies(data)
  } catch {
    /* cookies can only be set in route handlers / server actions; reads still work */
  }
  return data.accessToken
}
