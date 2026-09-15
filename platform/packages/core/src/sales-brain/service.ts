import type { Db, DbTx, Prisma } from '@vox/db'
import { SalesBrainSchema, type SalesBrain } from '@vox/shared'
import { DEFAULT_SALES_BRAIN } from './defaults.js'
import { NotFoundError } from '../errors.js'
import type { TenantContext } from '../tenant/context.js'

export class SalesBrainService {
  constructor(private readonly db: Db | DbTx) {}

  async resolve(unitId: string, env: 'production' | 'staging' = 'production'): Promise<{ brain: SalesBrain; version: number }> {
    const row =
      (env === 'staging' ? await this.db.salesBrainVersion.findFirst({ where: { unitId, status: 'staging' }, orderBy: { version: 'desc' } }) : null) ??
      (await this.db.salesBrainVersion.findFirst({ where: { unitId, status: 'production' }, orderBy: { version: 'desc' } }))
    if (!row) return { brain: DEFAULT_SALES_BRAIN, version: 0 }
    const parsed = SalesBrainSchema.safeParse(row.content)
    return { brain: parsed.success ? parsed.data : DEFAULT_SALES_BRAIN, version: row.version }
  }

  async list(ctx: TenantContext, unitId: string) {
    return this.db.salesBrainVersion.findMany({ where: { unitId, unit: { tenantId: ctx.tenantId } }, orderBy: { version: 'desc' } })
  }

  async createDraft(ctx: TenantContext, unitId: string, content: unknown, changelog?: string) {
    const unit = await this.db.unit.findFirst({ where: { id: unitId, tenantId: ctx.tenantId } })
    if (!unit) throw new NotFoundError('Unit', unitId)
    const brain = SalesBrainSchema.parse(content)
    const last = await this.db.salesBrainVersion.findFirst({ where: { unitId }, orderBy: { version: 'desc' } })
    return this.db.salesBrainVersion.create({
      data: { unitId, version: (last?.version ?? 0) + 1, status: 'draft', content: brain as unknown as Prisma.InputJsonValue, changelog: changelog ?? null, createdBy: ctx.userId ?? null },
    })
  }

  async publish(ctx: TenantContext, versionId: string) {
    const version = await this.db.salesBrainVersion.findFirst({ where: { id: versionId, unit: { tenantId: ctx.tenantId } } })
    if (!version) throw new NotFoundError('SalesBrainVersion', versionId)
    await this.db.salesBrainVersion.updateMany({ where: { unitId: version.unitId, status: 'production' }, data: { status: 'archived' } })
    return this.db.salesBrainVersion.update({ where: { id: versionId }, data: { status: 'production', publishedAt: new Date() } })
  }

  /** Compact textual rendering for prompts (keeps tokens low). */
  static render(brain: SalesBrain): string {
    const lines: string[] = []
    if (brain.methodology) lines.push(`Metodologia: ${brain.methodology}`)
    if (brain.toneGuidelines.length) lines.push(`Tom: ${brain.toneGuidelines.join(' ')}`)
    if (brain.discoveryQuestions.length) lines.push(`Perguntas de descoberta (use uma por vez, só se ainda não souber a resposta): ${brain.discoveryQuestions.join(' | ')}`)
    if (brain.personas.length) lines.push(`Personas: ${brain.personas.map((p) => `${p.name}: ${p.description} → produtos: ${p.recommendedProducts.join(', ')}`).join(' || ')}`)
    if (brain.objections.length) lines.push(`Objeções: ${brain.objections.map((o) => `[${o.key}] ${o.strategy}${o.responseHints.length ? ` Ex.: "${o.responseHints[0]}"` : ''}`).join(' || ')}`)
    if (brain.proofPoints.length) lines.push(`Provas: ${brain.proofPoints.join(' | ')}`)
    if (brain.stories.length) lines.push(`Histórias: ${brain.stories.join(' | ')}`)
    if (brain.commercialRules.length) lines.push(`Regras comerciais: ${brain.commercialRules.join(' | ')}`)
    if (brain.discountRules.length) lines.push(`Descontos: ${brain.discountRules.join(' | ')}`)
    if (brain.nextBestStepRules.length) lines.push(`Próximo passo: ${brain.nextBestStepRules.join(' | ')}`)
    if (brain.qualificationCriteria.length) lines.push(`Qualificação: ${brain.qualificationCriteria.join(' | ')}`)
    if (brain.forbidden.length) lines.push(`Proibido: ${brain.forbidden.join(' | ')}`)
    return lines.join('\n')
  }

  static signalsCatalog(brain: SalesBrain): string {
    return brain.signals.map((s) => `${s.key}: ${s.meaning}`).join('; ')
  }
}
