import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import sensible from '@fastify/sensible'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import type { AppContext } from './context.js'
import authPlugin from './plugins/auth.js'
import errorsPlugin from './plugins/errors.js'
import metricsPlugin from './plugins/metrics.js'
import { healthRoutes } from './routes/health.js'
import { whatsappWebhookRoutes } from './routes/webhooks/whatsapp.js'
import { authRoutes } from './routes/v1/auth.js'
import { conversationRoutes } from './routes/v1/conversations.js'
import { contactRoutes } from './routes/v1/contacts.js'
import { leadRoutes } from './routes/v1/leads.js'
import { productRoutes } from './routes/v1/products.js'
import { knowledgeRoutes } from './routes/v1/knowledge.js'
import { promptRoutes } from './routes/v1/prompts.js'
import { settingsRoutes } from './routes/v1/settings.js'
import { playgroundRoutes } from './routes/v1/playground.js'
import { analyticsRoutes } from './routes/v1/analytics.js'
import { schedulingRoutes } from './routes/v1/scheduling.js'
import { simulateRoutes } from './routes/v1/simulate.js'
import { streamRoutes } from './routes/v1/stream.js'

export type App = Awaited<ReturnType<typeof buildApp>>

export async function buildApp(ctx: AppContext) {
  const app = Fastify({
    loggerInstance: ctx.logger,
    trustProxy: true,
    bodyLimit: 25 * 1024 * 1024,
    disableRequestLogging: ctx.config.NODE_ENV === 'test',
  }).withTypeProvider<ZodTypeProvider>()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await app.register(helmet, { contentSecurityPolicy: false })
  await app.register(cors, {
    origin: ctx.config.WEB_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true,
  })
  await app.register(cookie)
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 1 } })
  await app.register(sensible)
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.auth?.userId ?? req.ip,
    allowList: () => false,
  })
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'VOX2you Conversational CRM API',
        version: '1.0.0',
        description: 'Public (v1), internal and webhook endpoints. Auth: Bearer JWT or X-Api-Key.',
      },
      servers: [{ url: ctx.config.PUBLIC_API_URL }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          apiKey: { type: 'apiKey', in: 'header', name: 'X-Api-Key' },
        },
      },
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      tags: [
        { name: 'auth' },
        { name: 'webhooks' },
        { name: 'inbox' },
        { name: 'crm' },
        { name: 'catalog' },
        { name: 'knowledge' },
        { name: 'agent' },
        { name: 'scheduling' },
        { name: 'analytics' },
        { name: 'settings' },
        { name: 'system' },
      ],
    },
    transform: jsonSchemaTransform,
  })
  if (ctx.config.NODE_ENV !== 'production') await app.register(swaggerUi, { routePrefix: '/docs' })

  await app.register(errorsPlugin)
  await app.register(authPlugin, { ctx })
  await app.register(metricsPlugin, { ctx })

  await app.register(healthRoutes)
  await app.register(whatsappWebhookRoutes, { prefix: '/webhooks' })
  await app.register(
    async (v1) => {
      await v1.register(authRoutes, { prefix: '/auth' })
      await v1.register(conversationRoutes, { prefix: '/conversations' })
      await v1.register(contactRoutes, { prefix: '/contacts' })
      await v1.register(leadRoutes)
      await v1.register(productRoutes, { prefix: '/products' })
      await v1.register(knowledgeRoutes, { prefix: '/knowledge' })
      await v1.register(promptRoutes)
      await v1.register(settingsRoutes)
      await v1.register(playgroundRoutes, { prefix: '/playground' })
      await v1.register(analyticsRoutes, { prefix: '/analytics' })
      await v1.register(schedulingRoutes)
      await v1.register(simulateRoutes, { prefix: '/simulate' })
      await v1.register(streamRoutes, { prefix: '/stream' })
    },
    { prefix: '/api/v1' },
  )

  app.addHook('onClose', async () => {
    await ctx.close()
  })
  return app
}
