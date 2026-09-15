import type { NextRequest } from 'next/server'
import { API_BASE, getAccessToken } from '@/lib/server/api'

/** SSE passthrough for realtime inbox updates. */
export async function GET(request: NextRequest) {
  const token = await getAccessToken()
  if (!token) return new Response('unauthorized', { status: 401 })
  const upstream = await fetch(`${API_BASE}/api/v1/stream/${request.nextUrl.search}`, {
    headers: { authorization: `Bearer ${token}`, accept: 'text/event-stream' },
    cache: 'no-store',
    signal: request.signal,
  })
  if (!upstream.ok || !upstream.body) return new Response('stream unavailable', { status: 502 })
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  })
}
