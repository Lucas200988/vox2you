import type { Db, Prisma } from '@vox/db'
import { sql, toVectorLiteral } from '@vox/db'
import { sha256 } from '@vox/shared'
import { chunkText } from './chunker.js'
import { NotFoundError, ValidationError } from '../errors.js'
import { emitEvent } from '../events/outbox.js'
import type { Providers } from '../providers/index.js'
import type { TenantContext } from '../tenant/context.js'
import type { Logger } from '../logger.js'

export interface CreateDocumentInput {
  unitId?: string | null
  productId?: string | null
  title: string
  category?: string
  sourceType: 'text' | 'url' | 'upload' | 'faq'
  content?: string
  url?: string
  file?: { buffer: Buffer; mimeType: string; fileName: string }
  priority?: number
  validFrom?: Date | null
  validTo?: Date | null
  language?: string
  publish?: boolean
}

const INJECTION_PATTERNS = [/ignore (all|any|previous|prior) instructions/i, /you are now/i, /system prompt/i, /disregard .* rules/i]

export class KnowledgeIngestionService {
  constructor(
    private readonly db: Db,
    private readonly providers: Pick<Providers, 'embedding' | 'storage' | 'parsers' | 'urlFetcher'>,
    private readonly logger?: Logger,
  ) {}

  async createDocument(ctx: TenantContext, input: CreateDocumentInput) {
    if (input.sourceType === 'text' && !input.content) throw new ValidationError('content is required for text documents')
    if (input.sourceType === 'url' && !input.url) throw new ValidationError('url is required')
    if (input.sourceType === 'upload' && !input.file) throw new ValidationError('file is required')

    let sourceRef: string | null = input.url ?? null
    let mimeType: string | null = null
    if (input.file) {
      const key = `kb/${ctx.tenantId}/${Date.now()}-${input.file.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      await this.providers.storage.put(key, input.file.buffer, input.file.mimeType)
      sourceRef = key
      mimeType = input.file.mimeType
    }
    const checksum = input.content ? sha256(input.content) : input.file ? sha256(input.file.buffer) : null

    const doc = await this.db.knowledgeDocument.create({
      data: {
        tenantId: ctx.tenantId,
        unitId: input.unitId ?? null,
        productId: input.productId ?? null,
        title: input.title,
        category: input.category ?? 'general',
        sourceType: input.sourceType,
        sourceRef,
        mimeType,
        status: input.publish ? 'published' : 'draft',
        publishedAt: input.publish ? new Date() : null,
        priority: input.priority ?? 5,
        validFrom: input.validFrom ?? null,
        validTo: input.validTo ?? null,
        language: input.language ?? 'pt-BR',
        checksum,
        ingestStatus: 'pending',
        createdBy: ctx.userId ?? null,
        metadata: input.content ? ({ content: input.content } as Prisma.InputJsonValue) : {},
      },
    })
    return doc
  }

  /** Parses, chunks, embeds and indexes a document. Idempotent: replaces existing chunks. */
  async ingest(documentId: string): Promise<{ chunks: number }> {
    const doc = await this.db.knowledgeDocument.findUnique({ where: { id: documentId } })
    if (!doc) throw new NotFoundError('KnowledgeDocument', documentId)
    await this.db.knowledgeDocument.update({ where: { id: documentId }, data: { ingestStatus: 'processing', ingestError: null } })
    try {
      const text = await this.loadText(doc)
      const alerts = INJECTION_PATTERNS.filter((p) => p.test(text)).map((p) => p.source)
      if (alerts.length) this.logger?.warn({ documentId, alerts }, 'knowledge document contains instruction-like text (recorded, not removed)')

      const chunks = chunkText(text)
      if (!chunks.length) throw new ValidationError('Document produced no indexable content')

      const embeddings: number[][] = []
      const batch = 32
      for (let i = 0; i < chunks.length; i += batch) {
        const slice = chunks.slice(i, i + batch)
        const vectors = await this.providers.embedding.embed(slice.map((c) => c.content))
        embeddings.push(...vectors)
      }

      await this.db.$transaction(async (tx) => {
        await tx.knowledgeChunk.deleteMany({ where: { documentId } })
        for (let i = 0; i < chunks.length; i++) {
          const c = chunks[i]!
          const vec = embeddings[i]!
          await tx.$executeRaw(
            sql`INSERT INTO knowledge_chunks (id, tenant_id, document_id, ordinal, content, token_count, metadata, embedding)
                VALUES (gen_random_uuid(), ${doc.tenantId}::uuid, ${documentId}::uuid, ${c.ordinal}, ${c.content}, ${c.tokenCount}, ${JSON.stringify({ ...c.metadata, title: doc.title, category: doc.category })}::jsonb, ${toVectorLiteral(vec)}::vector)`,
          )
        }
        await tx.knowledgeDocument.update({
          where: { id: documentId },
          data: { chunkCount: chunks.length, ingestStatus: 'ready', metadata: { ...(doc.metadata as object), injectionAlerts: alerts, embeddingModel: this.providers.embedding.model } as Prisma.InputJsonValue },
        })
      })
      return { chunks: chunks.length }
    } catch (err) {
      await this.db.knowledgeDocument.update({ where: { id: documentId }, data: { ingestStatus: 'failed', ingestError: (err as Error).message } })
      throw err
    }
  }

  private async loadText(doc: { sourceType: string; sourceRef: string | null; mimeType: string | null; metadata: unknown; title: string }): Promise<string> {
    if (doc.sourceType === 'text' || doc.sourceType === 'faq') {
      const content = (doc.metadata as { content?: string } | null)?.content
      if (!content) throw new ValidationError('Text document has no content')
      return content
    }
    if (doc.sourceType === 'url') {
      if (!this.providers.urlFetcher) throw new ValidationError('URL fetching is not configured')
      const parsed = await this.providers.urlFetcher.fetch(doc.sourceRef!)
      return parsed.text
    }
    // upload
    const buffer = await this.providers.storage.get(doc.sourceRef!)
    const mime = doc.mimeType ?? 'application/octet-stream'
    const parser = this.providers.parsers.find((p) => p.supports(mime, doc.sourceRef ?? undefined))
    if (!parser) throw new ValidationError(`No parser for ${mime}`)
    const parsed = await parser.parse({ buffer, mimeType: mime, fileName: doc.sourceRef ?? doc.title })
    return parsed.text
  }

  async publish(ctx: TenantContext, documentId: string) {
    const doc = await this.db.knowledgeDocument.findFirst({ where: { id: documentId, tenantId: ctx.tenantId } })
    if (!doc) throw new NotFoundError('KnowledgeDocument', documentId)
    return this.db.$transaction(async (tx) => {
      const updated = await tx.knowledgeDocument.update({ where: { id: documentId }, data: { status: 'published', publishedAt: new Date() } })
      await tx.auditLog.create({ data: { tenantId: ctx.tenantId, userId: ctx.userId ?? null, actor: ctx.actor, action: 'knowledge.publish', entityType: 'knowledge_document', entityId: documentId } })
      await emitEvent(tx, { type: 'knowledge.published', tenantId: ctx.tenantId, unitId: doc.unitId, aggregateType: 'knowledge_document', aggregateId: documentId, payload: { title: doc.title, version: doc.version }, actor: ctx.actor })
      return updated
    })
  }

  async setStatus(ctx: TenantContext, documentId: string, status: 'draft' | 'published' | 'expired' | 'archived') {
    if (status === 'published') return this.publish(ctx, documentId)
    const doc = await this.db.knowledgeDocument.findFirst({ where: { id: documentId, tenantId: ctx.tenantId } })
    if (!doc) throw new NotFoundError('KnowledgeDocument', documentId)
    return this.db.knowledgeDocument.update({ where: { id: documentId }, data: { status } })
  }

  /** New version of an existing document: archives the old one and creates the new with version+1. */
  async newVersion(ctx: TenantContext, documentId: string, input: Omit<CreateDocumentInput, 'title' | 'sourceType'> & { title?: string; sourceType?: CreateDocumentInput['sourceType'] }) {
    const old = await this.db.knowledgeDocument.findFirst({ where: { id: documentId, tenantId: ctx.tenantId } })
    if (!old) throw new NotFoundError('KnowledgeDocument', documentId)
    const created = await this.createDocument(ctx, {
      ...input,
      title: input.title ?? old.title,
      sourceType: input.sourceType ?? (old.sourceType as CreateDocumentInput['sourceType']),
      unitId: input.unitId ?? old.unitId,
      productId: input.productId ?? old.productId,
      category: input.category ?? old.category,
      priority: input.priority ?? old.priority,
    })
    await this.db.knowledgeDocument.update({ where: { id: created.id }, data: { version: old.version + 1 } })
    if (input.publish) await this.db.knowledgeDocument.update({ where: { id: old.id }, data: { status: 'archived' } })
    return created
  }

  /** Governance job: expire documents past validTo. */
  async expireOutdated(now = new Date()): Promise<number> {
    const res = await this.db.knowledgeDocument.updateMany({ where: { status: 'published', validTo: { lt: now } }, data: { status: 'expired' } })
    return res.count
  }
}
