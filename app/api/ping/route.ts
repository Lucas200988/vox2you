import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const wahaUrl = process.env.WAHA_BASE_URL
    const apiKey = process.env.WAHA_API_KEY

    if (!wahaUrl || !apiKey) return NextResponse.json({ ok: false })

    const res = await fetch(`${wahaUrl}/api/sessions`, {
      headers: { 'X-Api-Key': apiKey },
    })

    const data = await res.json()
    console.log('[Ping] WAHA status:', res.status)
    return NextResponse.json({ ok: true, status: res.status, sessions: data.length })
  } catch (error) {
    console.error('[Ping] Erro:', error)
    return NextResponse.json({ ok: false })
  }
}
