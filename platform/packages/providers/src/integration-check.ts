import { createSign } from 'node:crypto'
import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3'
import nodemailer from 'nodemailer'

export interface IntegrationCheckResult {
  ok: boolean
  message: string
  details?: Record<string, string>
}

const TIMEOUT_MS = 10_000

async function getJson(
  url: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
  const text = await res.text()
  let body: Record<string, unknown> = {}
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    body = { raw: text.slice(0, 200) }
  }
  return { status: res.status, body }
}

const errorMessage = (body: Record<string, unknown>): string => {
  const err = body['error'] as { message?: string } | string | undefined
  if (typeof err === 'string') return err
  return err?.message ?? (body['message'] as string | undefined) ?? 'resposta inesperada'
}

/**
 * Live connectivity checks used by "Testar" in Configurações → Integrações. Each one performs the
 * cheapest authenticated call the provider offers (no messages are sent, no money is spent).
 */
export async function checkIntegration(
  kind: string,
  v: Record<string, string>,
): Promise<IntegrationCheckResult> {
  try {
    switch (kind) {
      case 'anthropic': {
        const r = await getJson('https://api.anthropic.com/v1/models?limit=5', {
          'x-api-key': v['apiKey'] ?? '',
          'anthropic-version': '2023-06-01',
        })
        if (r.status !== 200)
          return {
            ok: false,
            message: `Anthropic recusou a chave (${r.status}): ${errorMessage(r.body)}`,
          }
        const models = ((r.body['data'] as Array<{ id: string }> | undefined) ?? []).map(
          (m) => m.id,
        )
        return {
          ok: true,
          message: 'Chave válida',
          details: { models: models.slice(0, 5).join(', ') },
        }
      }
      case 'openai': {
        const r = await getJson('https://api.openai.com/v1/models?limit=1', {
          authorization: `Bearer ${v['apiKey'] ?? ''}`,
        })
        if (r.status !== 200)
          return {
            ok: false,
            message: `OpenAI recusou a chave (${r.status}): ${errorMessage(r.body)}`,
          }
        return { ok: true, message: 'Chave válida' }
      }
      case 'whatsapp_meta': {
        const r = await getJson(
          `https://graph.facebook.com/v21.0/${encodeURIComponent(v['phoneNumberId'] ?? '')}?fields=display_phone_number,verified_name,quality_rating`,
          { authorization: `Bearer ${v['accessToken'] ?? ''}` },
        )
        if (r.status !== 200)
          return { ok: false, message: `Meta recusou (${r.status}): ${errorMessage(r.body)}` }
        return {
          ok: true,
          message: `Número ${String(r.body['display_phone_number'] ?? '')} (${String(r.body['verified_name'] ?? 'sem nome verificado')})`,
          details: {
            displayPhone: String(r.body['display_phone_number'] ?? ''),
            verifiedName: String(r.body['verified_name'] ?? ''),
            quality: String(r.body['quality_rating'] ?? ''),
          },
        }
      }
      case 'google_calendar': {
        const token = await googleAccessToken(v['serviceAccountJson'] ?? '')
        const r = await getJson(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(v['calendarId'] ?? '')}`,
          { authorization: `Bearer ${token}` },
        )
        if (r.status !== 200)
          return {
            ok: false,
            message: `Google recusou (${r.status}): ${errorMessage(r.body)}. Compartilhe o calendário com a service account.`,
          }
        return {
          ok: true,
          message: `Calendário "${String(r.body['summary'] ?? '')}" acessível`,
          details: { timeZone: String(r.body['timeZone'] ?? '') },
        }
      }
      case 'langfuse': {
        const base = (v['baseUrl'] || 'https://cloud.langfuse.com').replace(/\/$/, '')
        const auth = `Basic ${Buffer.from(`${v['publicKey'] ?? ''}:${v['secretKey'] ?? ''}`).toString('base64')}`
        const r = await getJson(`${base}/api/public/projects`, { authorization: auth })
        if (r.status !== 200)
          return { ok: false, message: `Langfuse recusou (${r.status}): ${errorMessage(r.body)}` }
        return { ok: true, message: 'Chaves válidas' }
      }
      case 'smtp': {
        const port = Number(v['port'] || 587)
        const transport = nodemailer.createTransport({
          host: v['host'],
          port,
          secure: port === 465,
          auth: v['user'] ? { user: v['user'], pass: v['pass'] } : undefined,
          connectionTimeout: TIMEOUT_MS,
        })
        await transport.verify()
        return { ok: true, message: 'Servidor SMTP autenticou' }
      }
      case 's3': {
        const client = new S3Client({
          region: v['region'] || 'us-east-1',
          endpoint: v['endpoint'] || undefined,
          forcePathStyle: !!v['endpoint'],
          credentials: {
            accessKeyId: v['accessKeyId'] ?? '',
            secretAccessKey: v['secretAccessKey'] ?? '',
          },
        })
        await client.send(new HeadBucketCommand({ Bucket: v['bucket'] }))
        return { ok: true, message: `Bucket ${v['bucket']} acessível` }
      }
      case 'meta_capi': {
        const r = await getJson(
          `https://graph.facebook.com/v21.0/${encodeURIComponent(v['pixelId'] ?? '')}?fields=id,name&access_token=${encodeURIComponent(v['token'] ?? '')}`,
          {},
        )
        if (r.status !== 200)
          return { ok: false, message: `Meta recusou (${r.status}): ${errorMessage(r.body)}` }
        return {
          ok: true,
          message: `Pixel ${String(r.body['name'] ?? r.body['id'] ?? '')} acessível`,
        }
      }
      default:
        return { ok: false, message: `Sem teste disponível para ${kind}` }
    }
  } catch (err) {
    return { ok: false, message: (err as Error).message }
  }
}

/** Service-account JWT → OAuth2 access token (calendar scope). */
async function googleAccessToken(serviceAccount: string): Promise<string> {
  const raw = serviceAccount.trim().startsWith('{')
    ? serviceAccount
    : Buffer.from(serviceAccount, 'base64').toString('utf8')
  const sa = JSON.parse(raw) as { client_email: string; private_key: string; token_uri?: string }
  const now = Math.floor(Date.now() / 1000)
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/calendar', aud: sa.token_uri ?? 'https://oauth2.googleapis.com/token', iat: now, exp: now + 300 })}`
  const signature = createSign('RSA-SHA256')
    .update(unsigned)
    .sign(sa.private_key)
    .toString('base64url')
  const res = await fetch(sa.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const body = (await res.json()) as {
    access_token?: string
    error_description?: string
    error?: string
  }
  if (!res.ok || !body.access_token)
    throw new Error(`Google OAuth: ${body.error_description ?? body.error ?? res.status}`)
  return body.access_token
}
