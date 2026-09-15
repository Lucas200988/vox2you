import 'dotenv/config'
import { createDb } from '@vox/db'
import { createLogger, KnowledgeIngestionService, seedVox2you } from '@vox/core'
import { createProvidersFromEnv } from '@vox/providers'

async function main() {
  const logger = createLogger('seed')
  const db = createDb()
  const { providers, status } = createProvidersFromEnv(process.env as Record<string, string | undefined>, logger)
  const result = await seedVox2you(db, {
    adminEmail: process.env['SEED_ADMIN_EMAIL'] ?? 'admin@vox2you.local',
    adminPassword: process.env['SEED_ADMIN_PASSWORD'] ?? 'admin12345',
    channelExternalId: process.env['WHATSAPP_PHONE_NUMBER_ID'] || 'mock-phone',
  })
  const ingestion = new KnowledgeIngestionService(db, providers, logger)
  for (const id of result.knowledgeDocumentIds) {
    const doc = await db.knowledgeDocument.findUnique({ where: { id }, select: { title: true, ingestStatus: true } })
    if (doc?.ingestStatus === 'ready') continue
    const r = await ingestion.ingest(id)
    logger.info({ title: doc?.title, chunks: r.chunks, embedding: providers.embedding.name }, 'knowledge ingested')
  }
  logger.info({ ...result, providers: status }, 'seed complete')
  logger.info(`Login: ${process.env['SEED_ADMIN_EMAIL'] ?? 'admin@vox2you.local'} / ${process.env['SEED_ADMIN_PASSWORD'] ?? 'admin12345'}`)
  await db.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
