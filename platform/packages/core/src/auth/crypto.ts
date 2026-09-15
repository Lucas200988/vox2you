import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

function deriveKey(secret: string): Buffer {
  // Accept any string; derive a stable 32-byte key
  return createHash('sha256').update(secret).digest()
}

/** AES-256-GCM. Output: base64(iv):base64(tag):base64(ciphertext) */
export function encryptJson(value: unknown, secret: string): string {
  const key = deriveKey(secret)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8')
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`
}

export function decryptJson<T = unknown>(payload: string, secret: string): T {
  const [ivB64, tagB64, dataB64] = payload.split(':')
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Invalid encrypted payload')
  const key = deriveKey(secret)
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  const plaintext = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()])
  return JSON.parse(plaintext.toString('utf8')) as T
}
