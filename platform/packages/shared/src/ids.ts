import { randomUUID, randomBytes, createHash } from 'node:crypto'

export function newId(): string {
  return randomUUID()
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function sha256(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex')
}
