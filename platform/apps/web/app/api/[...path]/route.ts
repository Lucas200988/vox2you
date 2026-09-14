import { NextResponse, type NextRequest } from 'next/server'
import { API_BASE, getAccessToken } from '@/lib/server/api'

/**
 * BFF proxy: /api/<path> → ${API}/api/v1/<path> with the Bearer token from the httpOnly cookie.
 * Keeps tokens out of the browser and the web app on a single origin.
 */
async function forward(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params
  const token = await getAccessToken()
  if (!token)
    return NextResponse.json({ error: 'unauthorized', message: 'Sessão expirada' }, { status: 401 })
  const target = `${API_BASE}/api/v1/${path.join('/')}${request.nextUrl.search}`
  const headers = new Headers()
  headers.set('authorization', `Bearer ${token}`)
  const contentType = request.headers.get('content-type')
  if (contentType) headers.set('content-type', contentType)
  const method = request.method
  const hasBody = method !== 'GET' && method !== 'HEAD'
  const body = hasBody ? await request.arrayBuffer() : undefined
  const upstream = await fetch(target, {
    method,
    headers,
    body: body && body.byteLength ? body : undefined,
    cache: 'no-store',
    redirect: 'manual',
  })
  const resHeaders = new Headers()
  const ct = upstream.headers.get('content-type')
  if (ct) resHeaders.set('content-type', ct)
  return new NextResponse(upstream.body, { status: upstream.status, headers: resHeaders })
}

export const GET = forward
export const POST = forward
export const PUT = forward
export const PATCH = forward
export const DELETE = forward
