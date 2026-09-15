import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { NotificationService } from '@vox/core'

const IdParams = z.object({ id: z.string().uuid() })

/** Bell in the web app: the caller's own notifications only. */
export const notificationRoutes: FastifyPluginAsync = async (app) => {
  const service = new NotificationService(app.ctx.db)

  app.get(
    '/',
    {
      schema: {
        tags: ['crm'],
        querystring: z.object({
          unread: z.enum(['0', '1']).optional(),
          limit: z.coerce.number().int().min(1).max(100).optional(),
        }),
      },
      preHandler: app.requireAuth(),
    },
    async (req) => {
      const q = req.query as { unread?: '0' | '1'; limit?: number }
      return service.list(req.auth!, { unreadOnly: q.unread === '1', limit: q.limit })
    },
  )

  app.post(
    '/:id/read',
    { schema: { tags: ['crm'], params: IdParams }, preHandler: app.requireAuth() },
    async (req) => {
      return service.markRead(req.auth!, (req.params as z.infer<typeof IdParams>).id)
    },
  )

  app.post(
    '/read-all',
    { schema: { tags: ['crm'] }, preHandler: app.requireAuth() },
    async (req) => {
      return service.markAllRead(req.auth!)
    },
  )
}
