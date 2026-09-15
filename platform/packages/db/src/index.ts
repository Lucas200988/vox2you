import { PrismaClient } from './generated/client.js'
import { PrismaPg } from '@prisma/adapter-pg'

export * from './generated/client.js'
export { Prisma } from './generated/client.js'
export * from './sql.js'

export type Db = PrismaClient
export type DbTx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

export interface CreateDbOptions {
  url?: string
  log?: Array<'query' | 'info' | 'warn' | 'error'>
}

export function createDb(options: CreateDbOptions = {}): PrismaClient {
  const connectionString = options.url ?? process.env['DATABASE_URL']
  if (!connectionString) throw new Error('DATABASE_URL is not set')
  const adapter = new PrismaPg({ connectionString })
  return new PrismaClient({
    adapter,
    log: options.log ?? (process.env['NODE_ENV'] === 'development' ? ['warn', 'error'] : ['error']),
  })
}

let singleton: PrismaClient | undefined

/** Process-wide client (apps). Tests should create their own via createDb(). */
export function getDb(): PrismaClient {
  if (!singleton) singleton = createDb()
  return singleton
}

export async function disconnectDb(): Promise<void> {
  if (singleton) {
    await singleton.$disconnect()
    singleton = undefined
  }
}
