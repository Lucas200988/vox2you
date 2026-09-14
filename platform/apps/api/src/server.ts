import { loadConfig } from './config.js'
import { createAppContext } from './context.js'
import { buildApp } from './app.js'

async function main() {
  const config = loadConfig()
  const ctx = await createAppContext(config)
  const app = await buildApp(ctx)
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down')
    await app.close()
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  await app.listen({ port: config.API_PORT, host: config.API_HOST })
  app.log.info({ providers: ctx.providerStatus, docs: config.NODE_ENV !== 'production' ? `${config.PUBLIC_API_URL}/docs` : undefined }, 'api ready')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
