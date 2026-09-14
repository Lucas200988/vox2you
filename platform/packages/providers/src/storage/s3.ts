import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { StorageProvider, StoredObject } from '@vox/core'

export interface S3Config {
  bucket: string
  region?: string
  endpoint?: string
  accessKeyId?: string
  secretAccessKey?: string
  forcePathStyle?: boolean
}

export class S3StorageProvider implements StorageProvider {
  readonly name = 's3'
  private readonly client: S3Client

  constructor(private readonly cfg: S3Config) {
    this.client = new S3Client({ region: cfg.region ?? 'us-east-1', endpoint: cfg.endpoint, forcePathStyle: cfg.forcePathStyle ?? !!cfg.endpoint, credentials: cfg.accessKeyId && cfg.secretAccessKey ? { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey } : undefined })
  }

  async put(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
    await this.client.send(new PutObjectCommand({ Bucket: this.cfg.bucket, Key: key, Body: body, ContentType: contentType }))
    return { key, size: body.length, contentType }
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }))
    const bytes = await res.Body?.transformToByteArray()
    return Buffer.from(bytes ?? [])
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: key }))
  }

  async signedUrl(key: string, expiresInSec = 900): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }), { expiresIn: expiresInSec })
  }
}
