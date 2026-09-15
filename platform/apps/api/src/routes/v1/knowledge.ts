import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { KnowledgeDocumentInputSchema, KnowledgeSearchSchema } from '@vox/shared'
import { KnowledgeIngestionService, KnowledgeSearchService, NotFoundError, unitScope, type IngestionJob } from '@vox/core'

const IdParams = z.object({ id: z.string().uuid() })

export const knowledgeRoutes: FastifyPluginAsync = async (app) => {
  const ingestion = new KnowledgeIngestionService(app.ctx.db, app.ctx.providers, app.ctx.logger)
  const enqueue = async (documentId: string, inline: boolean) => {
    if (inline || app.ctx.config.INBOUND_INLINE === '1') return ingestion.ingest(documentId)
    await app.ctx.queues.ingestion.add('ingest', { documentId } satisfies IngestionJob, { jobId: `ingest-${documentId}-${Date.now()}` })
    return { chunks: -1 }
  }

  app.get('/documents', { schema: { tags: ['knowledge'], querystring: z.object({ unitId: z.string().uuid().optional(), status: z.string().optional(), category: z.string().optional() }) }, preHandler: app.requireAuth('knowledge:read') }, async (req) => {
    const q = req.query as { unitId?: string; status?: string; category?: string }
    return { items: await app.ctx.db.knowledgeDocument.findMany({ where: { tenantId: req.auth!.tenantId, ...(q.unitId ? { OR: [{ unitId: q.unitId }, { unitId: null }] } : unitScope(req.auth!)), ...(q.status ? { status: q.status } : {}), ...(q.category ? { category: q.category } : {}) }, include: { product: { select: { name: true } }, unit: { select: { name: true } } }, orderBy: { updatedAt: 'desc' } }) }
  })

  app.get('/documents/:id', { schema: { tags: ['knowledge'], params: IdParams }, preHandler: app.requireAuth('knowledge:read') }, async (req) => {
    const doc = await app.ctx.db.knowledgeDocument.findFirst({ where: { id: (req.params as z.infer<typeof IdParams>).id, tenantId: req.auth!.tenantId }, include: { chunks: { orderBy: { ordinal: 'asc' }, select: { id: true, ordinal: true, content: true, tokenCount: true, metadata: true } } } })
    if (!doc) throw new NotFoundError('KnowledgeDocument')
    return doc
  })

  app.post('/documents', { schema: { tags: ['knowledge'], body: KnowledgeDocumentInputSchema.extend({ inline: z.boolean().optional() }) }, preHandler: [app.requireAuth('knowledge:write'), app.requireScope('knowledge:write')] }, async (req) => {
    const body = req.body as z.infer<typeof KnowledgeDocumentInputSchema> & { inline?: boolean }
    const doc = await ingestion.createDocument(req.auth!, { ...body, validFrom: body.validFrom ? new Date(body.validFrom) : null, validTo: body.validTo ? new Date(body.validTo) : null })
    const result = await enqueue(doc.id, body.inline ?? false)
    return { document: doc, ingestion: result }
  })

  app.post('/documents/upload', { schema: { tags: ['knowledge'], consumes: ['multipart/form-data'] }, preHandler: app.requireAuth('knowledge:write') }, async (req) => {
    const file = await req.file()
    if (!file) return app.httpErrors.badRequest('file is required')
    const buffer = await file.toBuffer()
    const fields = Object.fromEntries(Object.entries(file.fields).map(([k, v]) => [k, Array.isArray(v) ? (v[0] as { value?: string })?.value : (v as { value?: string })?.value]))
    const meta = KnowledgeDocumentInputSchema.partial().parse({ ...fields, publish: fields['publish'] === 'true', priority: fields['priority'] ? Number(fields['priority']) : undefined })
    const doc = await ingestion.createDocument(req.auth!, { title: meta.title ?? file.filename, category: meta.category, unitId: meta.unitId ?? null, productId: meta.productId ?? null, priority: meta.priority, publish: meta.publish, sourceType: 'upload', file: { buffer, mimeType: file.mimetype, fileName: file.filename } })
    const result = await enqueue(doc.id, fields['inline'] === 'true')
    return { document: doc, ingestion: result }
  })

  app.post('/documents/:id/status', { schema: { tags: ['knowledge'], params: IdParams, body: z.object({ status: z.enum(['draft', 'published', 'expired', 'archived']) }) }, preHandler: app.requireAuth('knowledge:publish') }, async (req) => {
    return ingestion.setStatus(req.auth!, (req.params as z.infer<typeof IdParams>).id, (req.body as { status: 'draft' | 'published' | 'expired' | 'archived' }).status)
  })

  app.post('/documents/:id/reingest', { schema: { tags: ['knowledge'], params: IdParams, body: z.object({ inline: z.boolean().optional() }).optional() }, preHandler: app.requireAuth('knowledge:write') }, async (req) => {
    const id = (req.params as z.infer<typeof IdParams>).id
    const doc = await app.ctx.db.knowledgeDocument.findFirst({ where: { id, tenantId: req.auth!.tenantId } })
    if (!doc) throw new NotFoundError('KnowledgeDocument')
    return enqueue(id, (req.body as { inline?: boolean } | undefined)?.inline ?? false)
  })

  app.post('/documents/:id/versions', { schema: { tags: ['knowledge'], params: IdParams, body: KnowledgeDocumentInputSchema.partial().extend({ inline: z.boolean().optional() }) }, preHandler: app.requireAuth('knowledge:write') }, async (req) => {
    const body = req.body as Partial<z.infer<typeof KnowledgeDocumentInputSchema>> & { inline?: boolean }
    const doc = await ingestion.newVersion(req.auth!, (req.params as z.infer<typeof IdParams>).id, { ...body, validFrom: body.validFrom ? new Date(body.validFrom) : null, validTo: body.validTo ? new Date(body.validTo) : null })
    const result = await enqueue(doc.id, body.inline ?? false)
    return { document: doc, ingestion: result }
  })

  app.post('/search', { schema: { tags: ['knowledge'], body: KnowledgeSearchSchema }, preHandler: app.requireAuth('knowledge:read') }, async (req) => {
    const body = req.body as z.infer<typeof KnowledgeSearchSchema>
    const hits = await new KnowledgeSearchService(app.ctx.db, app.ctx.providers.embedding).search({ tenantId: req.auth!.tenantId, unitId: body.unitId ?? null, query: body.query, productId: body.productId ?? null, limit: body.limit })
    return { hits, confidence: KnowledgeSearchService.retrievalConfidence(hits) }
  })
}
