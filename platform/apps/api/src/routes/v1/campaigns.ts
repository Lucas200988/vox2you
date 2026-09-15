import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { CampaignInputSchema, CampaignSegmentSchema } from '@vox/shared'
import { CAMPAIGN_TOKENS, CampaignService } from '@vox/core'

const IdParams = z.object({ id: z.string().uuid() })

/** WhatsApp template campaigns: segment → schedule → throttled sends → replies attributed. */
export const campaignRoutes: FastifyPluginAsync = async (app) => {
  const service = new CampaignService(app.ctx.db)

  app.get('/', { schema: { tags: ['campaigns'], querystring: z.object({ unitId: z.string().uuid().optional() }) }, preHandler: app.requireAuth('campaigns:read') }, async (req) => {
    const items = await service.list(req.auth!, (req.query as { unitId?: string }).unitId)
    return { items, tokens: CAMPAIGN_TOKENS }
  })

  app.post('/preview', { schema: { tags: ['campaigns'], body: z.object({ unitId: z.string().uuid(), segment: CampaignSegmentSchema }) }, preHandler: app.requireAuth('campaigns:read') }, async (req) => {
    const body = req.body as { unitId: string; segment: z.infer<typeof CampaignSegmentSchema> }
    return service.preview(req.auth!, body.unitId, body.segment)
  })

  app.post('/', { schema: { tags: ['campaigns'], body: CampaignInputSchema }, preHandler: app.requireAuth('campaigns:write') }, async (req, reply) => {
    const created = await service.create(req.auth!, req.body as z.infer<typeof CampaignInputSchema>)
    return reply.code(201).send(created)
  })

  app.get('/:id', { schema: { tags: ['campaigns'], params: IdParams }, preHandler: app.requireAuth('campaigns:read') }, async (req) => {
    return service.get(req.auth!, (req.params as z.infer<typeof IdParams>).id)
  })

  app.put('/:id', { schema: { tags: ['campaigns'], params: IdParams, body: CampaignInputSchema.partial() }, preHandler: app.requireAuth('campaigns:write') }, async (req) => {
    return service.update(req.auth!, (req.params as z.infer<typeof IdParams>).id, req.body as Partial<z.infer<typeof CampaignInputSchema>>)
  })

  app.post('/:id/schedule', { schema: { tags: ['campaigns'], params: IdParams, body: z.object({ at: z.string().datetime().optional() }).default({}) }, preHandler: app.requireAuth('campaigns:write') }, async (req) => {
    const at = (req.body as { at?: string } | undefined)?.at
    return service.schedule(req.auth!, (req.params as z.infer<typeof IdParams>).id, at ? new Date(at) : undefined)
  })
  app.post('/:id/pause', { schema: { tags: ['campaigns'], params: IdParams }, preHandler: app.requireAuth('campaigns:write') }, async (req) => service.pause(req.auth!, (req.params as z.infer<typeof IdParams>).id))
  app.post('/:id/resume', { schema: { tags: ['campaigns'], params: IdParams }, preHandler: app.requireAuth('campaigns:write') }, async (req) => service.resume(req.auth!, (req.params as z.infer<typeof IdParams>).id))
  app.post('/:id/cancel', { schema: { tags: ['campaigns'], params: IdParams }, preHandler: app.requireAuth('campaigns:write') }, async (req) => service.cancel(req.auth!, (req.params as z.infer<typeof IdParams>).id))

  app.get('/:id/recipients', { schema: { tags: ['campaigns'], params: IdParams, querystring: z.object({ status: z.string().optional(), limit: z.coerce.number().int().min(1).max(500).optional() }) }, preHandler: app.requireAuth('campaigns:read') }, async (req) => {
    const q = req.query as { status?: string; limit?: number }
    return { items: await service.recipients(req.auth!, (req.params as z.infer<typeof IdParams>).id, q.status, q.limit) }
  })
}
