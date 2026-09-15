import pino, { type Logger } from 'pino'

export type { Logger }

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'authorization',
  'token',
  'accessToken',
  'refreshToken',
  'password',
  'passwordHash',
  'apiKey',
  'credentials',
  'credentialsEnc',
  '*.token',
  '*.password',
  '*.apiKey',
]

export function createLogger(name: string, level = process.env['LOG_LEVEL'] ?? 'info'): Logger {
  const pretty = process.env['NODE_ENV'] !== 'production' && process.env['LOG_PRETTY'] !== '0'
  return pino({
    name,
    level,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    ...(pretty
      ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } }
      : {}),
  })
}

/** Masks a phone number for logs: +5565999998888 → +55659****8888 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  if (phone.length < 8) return '****'
  return `${phone.slice(0, 6)}****${phone.slice(-4)}`
}

export function maskEmail(email: string | null | undefined): string {
  if (!email) return ''
  const [user, domain] = email.split('@')
  if (!user || !domain) return '***'
  return `${user.slice(0, 2)}***@${domain}`
}
