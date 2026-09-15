import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { DatasetService } from '@vox/core'

const IdParams = z.object({ id: z.string().uuid() })
const ItemParams = z.object({ id: z.string().uuid(), itemId: z.string().uuid() })
const ItemInput = z.object({
  text: z.string().min(1).max(4000),
  facts: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
  history: z.array(z.string().max(4000)).max(10).optional(),
})
const Expectation = z.object({
  intent: z.string().optional(),
  decision: z.enum(['reply', 'handoff', 'silent', 'template_required', 'blocked']).optional(),
  mustInclude: z.array(z.string()).optional(),
  mustNotInclude: z.array(z.string()).optional(),
  mustNotMatch: z.array(z.string()).optional(),
  validationOk: z.boolean().optional(),
})
const Config = z.object({
  unitId: z.string().uuid(),
  label: z.string().max(40).optional(),
  promptVersion: z.number().int().optional(),
  model: z.string().optional(),
  persona: z.string().optional(),
  env: z.enum(['production', 'staging']).optional(),
})

/** Regression datasets for the agent (playground:use): items with expectations, run and A/B compare. */
export const datasetRoutes: FastifyPluginAsync = async (app) => {
  const service = new DatasetService(app.ctx.db, app.ctx.deps)
  const id = (req: { params: unknown }) => (req.params as z.infer<typeof IdParams>).id

  app.get(
    '/',
    { schema: { tags: ['agent'] }, preHandler: app.requireAuth('playground:use') },
    async (req) => ({ items: await service.list(req.auth!) }),
  )
  app.post(
    '/',
    {
      schema: {
        tags: ['agent'],
        body: z.object({
          name: z.string().min(2).max(80),
          description: z.string().max(500).optional(),
        }),
      },
      preHandler: app.requireAuth('playground:use'),
    },
    async (req, reply) => {
      const created = await service.create(
        req.auth!,
        req.body as { name: string; description?: string },
      )
      return reply.code(201).send(created)
    },
  )
  app.get(
    '/:id',
    {
      schema: { tags: ['agent'], params: IdParams },
      preHandler: app.requireAuth('playground:use'),
    },
    async (req) => service.get(req.auth!, id(req)),
  )
  app.delete(
    '/:id',
    {
      schema: { tags: ['agent'], params: IdParams },
      preHandler: app.requireAuth('playground:use'),
    },
    async (req) => {
      await service.remove(req.auth!, id(req))
      return { ok: true }
    },
  )
  app.post(
    '/:id/items',
    {
      schema: {
        tags: ['agent'],
        params: IdParams,
        body: z.object({ input: ItemInput, expected: Expectation.optional() }),
      },
      preHandler: app.requireAuth('playground:use'),
    },
    async (req, reply) => {
      const body = req.body as {
        input: z.infer<typeof ItemInput>
        expected?: z.infer<typeof Expectation>
      }
      return reply
        .code(201)
        .send(await service.addItem(req.auth!, id(req), body.input, body.expected))
    },
  )
  app.post(
    '/:id/items/from-conversation',
    {
      schema: {
        tags: ['agent'],
        params: IdParams,
        body: z.object({ conversationId: z.string().uuid(), expected: Expectation.optional() }),
      },
      preHandler: app.requireAuth('playground:use'),
    },
    async (req, reply) => {
      const body = req.body as { conversationId: string; expected?: z.infer<typeof Expectation> }
      return reply
        .code(201)
        .send(
          await service.addFromConversation(req.auth!, id(req), body.conversationId, body.expected),
        )
    },
  )
  app.put(
    '/:id/items/:itemId',
    {
      schema: {
        tags: ['agent'],
        params: ItemParams,
        body: z.object({
          input: ItemInput.optional(),
          expected: Expectation.nullable().optional(),
        }),
      },
      preHandler: app.requireAuth('playground:use'),
    },
    async (req) => {
      const p = req.params as z.infer<typeof ItemParams>
      return service.updateItem(
        req.auth!,
        p.id,
        p.itemId,
        req.body as {
          input?: z.infer<typeof ItemInput>
          expected?: z.infer<typeof Expectation> | null
        },
      )
    },
  )
  app.delete(
    '/:id/items/:itemId',
    {
      schema: { tags: ['agent'], params: ItemParams },
      preHandler: app.requireAuth('playground:use'),
    },
    async (req) => {
      const p = req.params as z.infer<typeof ItemParams>
      await service.removeItem(req.auth!, p.id, p.itemId)
      return { ok: true }
    },
  )
  app.post(
    '/:id/run',
    {
      schema: { tags: ['agent'], params: IdParams, body: Config },
      preHandler: app.requireAuth('playground:use'),
    },
    async (req) => service.run(req.auth!, id(req), req.body as z.infer<typeof Config>),
  )
  app.post(
    '/:id/compare',
    {
      schema: { tags: ['agent'], params: IdParams, body: z.object({ a: Config, b: Config }) },
      preHandler: app.requireAuth('playground:use'),
    },
    async (req) => {
      const body = req.body as { a: z.infer<typeof Config>; b: z.infer<typeof Config> }
      return service.compare(req.auth!, id(req), body.a, body.b)
    },
  )
}
