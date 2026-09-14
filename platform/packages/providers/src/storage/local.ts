import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { StorageProvider, StoredObject } from '@vox/core'

/** Local filesystem storage for development/tests. */
export class LocalFsStorageProvider implements StorageProvider {
  readonly name = 'local'
  private readonly root: string

  constructor(root = './storage', private readonly publicBaseUrl = '/files') {
    this.root = resolve(root)
  }

  private path(key: string): string {
    const p = resolve(join(this.root, key))
    if (!p.startsWith(this.root)) throw new Error('Invalid storage key')
    return p
  }

  async put(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
    const p = this.path(key)
    await mkdir(dirname(p), { recursive: true })
    await writeFile(p, body)
    return { key, size: body.length, contentType }
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.path(key))
  }

  async delete(key: string): Promise<void> {
    await unlink(this.path(key)).catch(() => undefined)
  }

  async signedUrl(key: string): Promise<string> {
    return `${this.publicBaseUrl}/${encodeURIComponent(key)}`
  }
}
