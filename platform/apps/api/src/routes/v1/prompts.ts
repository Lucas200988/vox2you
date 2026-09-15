import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  PROMPT_KEYS,
  PromptVersionInputSchema,
  SalesBrainSchema,
  type PromptKey,
} from '@vox/shared'
import { PromptAdminService, SalesBrainService, PromptImprovementService } from '@vox/core'

export const promptRoutes: FastifyPluginAsync = async (app) => {
  const prompts = new PromptAdminService(app.ctx.db)

  app.get(
    '/prompts',
    { schema: { tags: ['agent'] }, preHandler: app.requireAuth('prompts:read') },
    async (req) => ({ items: await prompts.list(req.auth!) }),
  )

  app.post(
    '/prompts/:key/versions',
    {
      schema: {
        tags: ['agent'],
        params: z.object({ key: z.enum(PROMPT_KEYS) }),
        body: PromptVersionInputSchema,
      },
      preHandler: app.requireAuth('prompts:write'),
    },
    async (req) => {
      const version = await prompts.createDraft(
        req.auth!,
        (req.params as { key: (typeof PROMPT_KEYS)[number] }).key,
        req.body as z.infer<typeof PromptVersionInputSchema>,
      )
      app.ctx.prompts.invalidate()
      return version
    },
  )

  app.post(
    '/prompts/:key/suggest',
    {
      schema: {
        tags: ['agent'],
        params: z.object({ key: z.enum(PROMPT_KEYS) }),
        body: z
          .object({
            unitId: z.string().uuid().optional(),
            days: z.number().int().min(1).max(90).optional(),
            focus: z.string().max(500).optional(),
          })
          .default({}),
      },
      preHandler: app.requireAuth('prompts:write'),
    },
    async (req) => {
      const body = (req.body ?? {}) as { unitId?: string; days?: number; focus?: string }
      return new PromptImprovementService(app.ctx.deps).suggest(
        req.auth!,
        (req.params as { key: PromptKey }).key,
        body,
      )
    },
  )

  app.post(
    '/prompts/versions/:id/status',
    {
      schema: {
        tags: ['agent'],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ status: z.enum(['draft', 'staging', 'production', 'archived']) }),
      },
      preHandler: app.requireAuth('prompts:publish'),
    },
    async (req) => {
      const v = await prompts.setStatus(
        req.auth!,
        (req.params as { id: string }).id,
        (req.body as { status: 'draft' | 'staging' | 'production' | 'archived' }).status,
      )
      app.ctx.prompts.invalidate()
      return v
    },
  )

  const brain = new SalesBrainService(app.ctx.db)
  app.get(
    '/sales-brain',
    {
      schema: {
        tags: ['agent'],
        querystring: z.object({
          unitId: z.string().uuid(),
          env: z.enum(['production', 'staging']).optional(),
        }),
      },
      preHandler: app.requireAuth('prompts:read'),
    },
    async (req) => {
      const q = req.query as { unitId: string; env?: 'production' | 'staging' }
      const current = await brain.resolve(q.unitId, q.env)
      return { ...current, versions: await brain.list(req.auth!, q.unitId) }
    },
  )

  app.post(
    '/sales-brain/versions',
    {
      schema: {
        tags: ['agent'],
        body: z.object({
          unitId: z.string().uuid(),
          content: SalesBrainSchema,
          changelog: z.string().optional(),
        }),
      },
      preHandler: app.requireAuth('prompts:write'),
    },
    async (req) => {
      const body = req.body as { unitId: string; content: unknown; changelog?: string }
      return brain.createDraft(req.auth!, body.unitId, body.content, body.changelog)
    },
  )

  app.post(
    '/sales-brain/versions/:id/publish',
    {
      schema: { tags: ['agent'], params: z.object({ id: z.string().uuid() }) },
      preHandler: app.requireAuth('prompts:publish'),
    },
    async (req) => {
      return brain.publish(req.auth!, (req.params as { id: string }).id)
    },
  )
}
