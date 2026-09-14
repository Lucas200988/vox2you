import type { Db, DbTx } from '@vox/db'
import { DEFAULT_LOST_REASONS, DEFAULT_PIPELINE_STAGES } from '@vox/shared'
import { NotFoundError } from '../errors.js'
import type { TenantContext } from '../tenant/context.js'

export class PipelineService {
  constructor(private readonly db: Db) {}

  /** Returns the default pipeline for a unit (unit-specific first, then tenant-wide). */
  async getDefaultPipeline(ctx: TenantContext, unitId: string) {
    const pipeline =
      (await this.db.pipeline.findFirst({
        where: { tenantId: ctx.tenantId, unitId, isDefault: true },
        include: { stages: { orderBy: { order: 'asc' } } },
      })) ??
      (await this.db.pipeline.findFirst({
        where: { tenantId: ctx.tenantId, unitId: null, isDefault: true },
        include: { stages: { orderBy: { order: 'asc' } } },
      }))
    if (!pipeline) throw new NotFoundError('Default pipeline')
    return pipeline
  }

  async list(ctx: TenantContext) {
    return this.db.pipeline.findMany({
      where: { tenantId: ctx.tenantId },
      include: { stages: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    })
  }

  /** Creates the standard VOX2you pipeline + lost reasons for a tenant/unit if missing. */
  static async ensureDefaults(tx: DbTx, tenantId: string, unitId: string | null) {
    let pipeline = await tx.pipeline.findFirst({ where: { tenantId, unitId, isDefault: true } })
    if (!pipeline) {
      pipeline = await tx.pipeline.create({
        data: {
          tenantId,
          unitId,
          name: 'Funil Comercial',
          isDefault: true,
          stages: {
            create: DEFAULT_PIPELINE_STAGES.map((s, i) => ({
              key: s.key,
              name: s.name,
              order: i,
              kind: s.kind,
              probability: s.probability,
              color: s.color,
              maxHoursInStage: s.maxHoursInStage ?? null,
            })),
          },
        },
      })
    }
    for (const reason of DEFAULT_LOST_REASONS) {
      const parent = await tx.lostReason.upsert({
        where: { tenantId_key: { tenantId, key: reason.key } },
        update: {},
        create: { tenantId, key: reason.key, name: reason.name },
      })
      for (const child of reason.children ?? []) {
        await tx.lostReason.upsert({
          where: { tenantId_key: { tenantId, key: child.key } },
          update: {},
          create: { tenantId, key: child.key, name: child.name, parentId: parent.id },
        })
      }
    }
    return pipeline
  }
}
