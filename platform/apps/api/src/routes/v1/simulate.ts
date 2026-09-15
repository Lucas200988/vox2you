import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { SimulateInboundSchema } from '@vox/shared'
import { NotFoundError, type InboundEvent, type InboundJob } from '@vox/core'
import { MockMessagingProvider } from '@vox/providers'

/**
 * Simulates an inbound WhatsApp message for a unit's channel (admin/manager only). With
 * `inline: true` the message is processed synchronously and the agent result is returned — used
 * by demos, tests and the CLI simulator.
 */
export const simulateRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/inbound',
    {
      schema: {
        tags: ['agent'],
        body: SimulateInboundSchema.extend({ inline: z.boolean().default(true) }),
      },
      preHandler: app.requireAuth('playground:use'),
    },
    async (req) => {
      const body = req.body as z.infer<typeof SimulateInboundSchema> & { inline: boolean }
      const channel = body.channelId
        ? await app.ctx.db.channel.findFirst({
            where: { id: body.channelId, tenantId: req.auth!.tenantId },
          })
        : await app.ctx.db.channel.findFirst({
            where: {
              tenantId: req.auth!.tenantId,
              kind: 'whatsapp',
              ...(body.unitId ? { unitId: body.unitId } : {}),
            },
            orderBy: { createdAt: 'asc' },
          })
      if (!channel) throw new NotFoundError('WhatsApp channel')
      const from = body.phone.replace(/\D/g, '')
      const payload =
        body.type === 'audio'
          ? MockMessagingProvider.inboundAudioPayload({
              phoneNumberId: channel.externalId,
              from,
              name: body.name,
            })
          : MockMessagingProvider.inboundTextPayload({
              phoneNumberId: channel.externalId,
              from,
              name: body.name,
              text: body.text,
              referral: body.referral
                ? {
                    source_url: body.referral.sourceUrl ?? '',
                    headline: body.referral.headline ?? '',
                    ctwa_clid: body.referral.ctwaClid ?? '',
                    source_id: body.referral.adId ?? '',
                  }
                : undefined,
            })
      const [parsed] = new MockMessagingProvider().parseInbound(payload)
      if (!parsed) throw new Error('could not build event')
      // Pin the tenant-scoped channel we resolved above so the processor never routes by external id here.
      const event: InboundEvent = { ...parsed, channelId: channel.id }
      if (body.inline) return app.ctx.inbound.process(event)
      const job: InboundJob = {
        key: `msg:${event.kind === 'message' ? event.providerMessageId : 'status'}`,
        event,
        receivedAt: new Date().toISOString(),
      }
      await app.ctx.queues.inbound.add('inbound', job)
      return { queued: true }
    },
  )
}
