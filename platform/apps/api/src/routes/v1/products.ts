import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { ClassScheduleInputSchema, OfferInputSchema, ProductInputSchema } from '@vox/shared'
import { ProductService } from '@vox/core'

const IdParams = z.object({ id: z.string().uuid() })

export const productRoutes: FastifyPluginAsync = async (app) => {
  const products = new ProductService(app.ctx.db)

  app.get('/', { schema: { tags: ['catalog'], querystring: z.object({ unitId: z.string().uuid().optional(), includeInactive: z.coerce.boolean().optional() }) }, preHandler: app.requireAuth('products:read') }, async (req) => {
    const q = req.query as { unitId?: string; includeInactive?: boolean }
    return { items: await products.list(req.auth!, q.unitId, q.includeInactive ?? true) }
  })

  app.get('/catalog', { schema: { tags: ['catalog'], querystring: z.object({ unitId: z.string().uuid() }) }, preHandler: app.requireAuth('products:read') }, async (req) => {
    return { items: await products.catalogForAgent(req.auth!, (req.query as { unitId: string }).unitId) }
  })

  app.get('/:id', { schema: { tags: ['catalog'], params: IdParams }, preHandler: app.requireAuth('products:read') }, async (req) => {
    return products.get(req.auth!, (req.params as z.infer<typeof IdParams>).id)
  })

  app.post('/', { schema: { tags: ['catalog'], body: ProductInputSchema }, preHandler: app.requireAuth('products:write') }, async (req) => {
    const body = req.body as z.infer<typeof ProductInputSchema>
    return products.create(req.auth!, { ...body, unitId: body.unitId ?? null })
  })

  app.patch('/:id', { schema: { tags: ['catalog'], params: IdParams, body: ProductInputSchema.partial() }, preHandler: app.requireAuth('products:write') }, async (req) => {
    return products.update(req.auth!, (req.params as z.infer<typeof IdParams>).id, req.body as Record<string, unknown>)
  })

  app.post('/:id/offers', { schema: { tags: ['catalog'], params: IdParams, body: OfferInputSchema }, preHandler: app.requireAuth('products:write') }, async (req) => {
    const body = req.body as z.infer<typeof OfferInputSchema>
    return products.createOffer(req.auth!, (req.params as z.infer<typeof IdParams>).id, { ...body, unitId: body.unitId ?? null, validFrom: body.validFrom ? new Date(body.validFrom) : null, validTo: body.validTo ? new Date(body.validTo) : null })
  })

  app.patch('/offers/:id', { schema: { tags: ['catalog'], params: IdParams, body: OfferInputSchema.partial() }, preHandler: app.requireAuth('products:write') }, async (req) => {
    const body = req.body as Partial<z.infer<typeof OfferInputSchema>>
    return products.updateOffer(req.auth!, (req.params as z.infer<typeof IdParams>).id, { ...body, validFrom: body.validFrom === undefined ? undefined : body.validFrom ? new Date(body.validFrom) : null, validTo: body.validTo === undefined ? undefined : body.validTo ? new Date(body.validTo) : null })
  })

  app.post('/:id/classes', { schema: { tags: ['catalog'], params: IdParams, body: ClassScheduleInputSchema }, preHandler: app.requireAuth('products:write') }, async (req) => {
    const body = req.body as z.infer<typeof ClassScheduleInputSchema>
    return products.createClassSchedule(req.auth!, (req.params as z.infer<typeof IdParams>).id, { ...body, startsOn: new Date(body.startsOn), endsOn: body.endsOn ? new Date(body.endsOn) : null })
  })

  app.patch('/classes/:id', { schema: { tags: ['catalog'], params: IdParams, body: ClassScheduleInputSchema.partial() }, preHandler: app.requireAuth('products:write') }, async (req) => {
    const body = req.body as Partial<z.infer<typeof ClassScheduleInputSchema>>
    return products.updateClassSchedule(req.auth!, (req.params as z.infer<typeof IdParams>).id, { ...body, startsOn: body.startsOn ? new Date(body.startsOn) : undefined, endsOn: body.endsOn === undefined ? undefined : body.endsOn ? new Date(body.endsOn) : null })
  })
}
