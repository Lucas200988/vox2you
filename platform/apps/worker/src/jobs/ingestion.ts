import { KnowledgeIngestionService, type IngestionJob } from '@vox/core'
import type { WorkerContext } from '../main.js'

export async function processIngestion(ctx: WorkerContext, job: IngestionJob) {
  const service = new KnowledgeIngestionService(ctx.db, ctx.providers, ctx.logger)
  const result = await service.ingest(job.documentId)
  ctx.logger.info({ documentId: job.documentId, chunks: result.chunks }, 'knowledge document ingested')
  return result
}
