import fp from 'fastify-plugin'
import { ZodError } from 'zod'
import { AppError } from '@vox/core'
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod'

export default fp(async (app) => {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({ error: err.code, message: err.message, details: err.details })
    }
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.status(400).send({ error: 'validation_error', message: 'Request validation failed', details: (err as { validation?: unknown }).validation })
    }
    if (isResponseSerializationError(err)) {
      req.log.error({ err }, 'response serialization failed')
      return reply.status(500).send({ error: 'serialization_error', message: 'Invalid response' })
    }
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: 'validation_error', message: 'Validation failed', details: err.issues })
    }
    const error = err as Error & { statusCode?: number }
    const status = error.statusCode ?? 500
    if (status >= 500) req.log.error({ err: error }, 'unhandled error')
    return reply.status(status).send({ error: status >= 500 ? 'internal_error' : 'request_error', message: status >= 500 ? 'Internal error' : error.message })
  })
})
