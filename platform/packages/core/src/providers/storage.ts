export interface StoredObject {
  key: string
  size: number
  contentType: string
}

export interface StorageProvider {
  readonly name: string
  put(key: string, body: Buffer, contentType: string): Promise<StoredObject>
  get(key: string): Promise<Buffer>
  delete(key: string): Promise<void>
  /** Temporary URL for download (may be a local /files route in dev). */
  signedUrl(key: string, expiresInSec?: number): Promise<string>
}
