import type { Db, Prisma } from '@vox/db'
import { formatBrl, slugify } from '@vox/shared'
import { NotFoundError } from '../errors.js'
import type { TenantContext } from '../tenant/context.js'

/**
 * Product catalog — the ONLY source for prices, conditions and class availability.
 * The agent reads it through tools; nothing here is ever placed in a system prompt as free text.
 */
export class ProductService {
  constructor(private readonly db: Db) {}

  async list(ctx: TenantContext, unitId?: string, includeInactive = false) {
    return this.db.product.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(unitId ? { OR: [{ unitId }, { unitId: null }] } : {}),
        ...(includeInactive ? {} : { status: 'active' }),
      },
      include: {
        offers: { orderBy: { createdAt: 'desc' } },
        classSchedules: unitId ? { where: { unitId }, orderBy: { startsOn: 'asc' } } : { orderBy: { startsOn: 'asc' } },
      },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    })
  }

  async get(ctx: TenantContext, id: string) {
    const product = await this.db.product.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { offers: { orderBy: { createdAt: 'desc' } }, classSchedules: { orderBy: { startsOn: 'asc' } } },
    })
    if (!product) throw new NotFoundError('Product', id)
    return product
  }

  async create(ctx: TenantContext, data: Omit<Prisma.ProductUncheckedCreateInput, 'tenantId' | 'slug'> & { slug?: string }) {
    const slug = data.slug ?? slugify(data.name)
    return this.db.product.create({ data: { ...data, slug, tenantId: ctx.tenantId } })
  }

  async update(ctx: TenantContext, id: string, data: Prisma.ProductUncheckedUpdateInput) {
    await this.get(ctx, id)
    return this.db.product.update({ where: { id }, data })
  }

  async createOffer(ctx: TenantContext, productId: string, data: Omit<Prisma.OfferUncheckedCreateInput, 'tenantId' | 'productId'>) {
    await this.get(ctx, productId)
    return this.db.offer.create({ data: { ...data, tenantId: ctx.tenantId, productId } })
  }

  async updateOffer(ctx: TenantContext, offerId: string, data: Prisma.OfferUncheckedUpdateInput) {
    const offer = await this.db.offer.findFirst({ where: { id: offerId, tenantId: ctx.tenantId } })
    if (!offer) throw new NotFoundError('Offer', offerId)
    return this.db.offer.update({ where: { id: offerId }, data })
  }

  async createClassSchedule(ctx: TenantContext, productId: string, data: Omit<Prisma.ClassScheduleUncheckedCreateInput, 'tenantId' | 'productId'>) {
    await this.get(ctx, productId)
    return this.db.classSchedule.create({ data: { ...data, tenantId: ctx.tenantId, productId } })
  }

  async updateClassSchedule(ctx: TenantContext, id: string, data: Prisma.ClassScheduleUncheckedUpdateInput) {
    const cs = await this.db.classSchedule.findFirst({ where: { id, tenantId: ctx.tenantId } })
    if (!cs) throw new NotFoundError('ClassSchedule', id)
    return this.db.classSchedule.update({ where: { id }, data })
  }

  /** Offers that are active AND within validity for a unit (unit-specific wins over tenant-wide). */
  static pickActiveOffers<T extends { unitId: string | null; status: string; validFrom: Date | null; validTo: Date | null }>(offers: T[], unitId: string, now = new Date()): T[] {
    const valid = offers.filter(
      (o) => o.status === 'active' && (!o.validFrom || o.validFrom <= now) && (!o.validTo || o.validTo >= now) && (o.unitId === null || o.unitId === unitId),
    )
    const unitSpecific = valid.filter((o) => o.unitId === unitId)
    return unitSpecific.length ? unitSpecific : valid
  }

  /**
   * Structured, agent-facing catalog snapshot for a unit. Prices come only from active, valid offers.
   * Returned to the agent through the `get_catalog` / `get_product_offer` tools.
   */
  async catalogForAgent(ctx: TenantContext, unitId: string, now = new Date()) {
    const products = await this.list(ctx, unitId)
    return products.map((p) => {
      const offers = ProductService.pickActiveOffers(p.offers, unitId, now)
      const classes = p.classSchedules.filter((c) => c.unitId === unitId && (c.status === 'open' || c.status === 'full') && (!c.endsOn || c.endsOn >= now))
      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        category: p.category,
        modality: p.modality,
        audience: p.audience,
        shortDescription: p.shortDescription,
        personas: p.personas,
        painsSolved: p.painsSolved,
        benefits: p.benefits,
        durationText: p.durationText,
        format: p.format,
        salesArguments: p.salesArguments,
        objectionHandlers: p.objectionHandlers,
        offers: offers.map((o) => ({
          id: o.id,
          name: o.name,
          listPrice: Number(o.listPrice),
          promoPrice: o.promoPrice !== null ? Number(o.promoPrice) : null,
          installmentsMax: o.installmentsMax,
          installmentValue: o.installmentValue !== null ? Number(o.installmentValue) : null,
          conditions: o.conditions,
          paymentMethods: o.paymentMethods,
          maxDiscountPct: Number(o.maxDiscountPct),
          discountRequiresApproval: o.discountRequiresApproval,
          validTo: o.validTo?.toISOString() ?? null,
          display: ProductService.formatOffer(o),
        })),
        classes: classes.map((c) => ({
          id: c.id,
          name: c.name,
          startsOn: c.startsOn.toISOString().slice(0, 10),
          weekdays: c.weekdays,
          startTime: c.startTime,
          endTime: c.endTime,
          period: c.period,
          seatsLeft: Math.max(0, c.capacity - c.enrolled),
          status: c.status,
        })),
      }
    })
  }

  static formatOffer(o: { listPrice: Prisma.Decimal | number; promoPrice: Prisma.Decimal | number | null; installmentsMax: number | null; installmentValue: Prisma.Decimal | number | null; conditions: string | null }): string {
    const list = Number(o.listPrice)
    const promo = o.promoPrice !== null ? Number(o.promoPrice) : null
    const parts: string[] = []
    if (promo !== null && promo < list) parts.push(`${formatBrl(promo)} (de ${formatBrl(list)})`)
    else parts.push(formatBrl(list))
    if (o.installmentsMax && o.installmentValue !== null) parts.push(`ou ${o.installmentsMax}x de ${formatBrl(Number(o.installmentValue))}`)
    if (o.conditions) parts.push(o.conditions)
    return parts.join(' ')
  }
}

export type AgentCatalog = Awaited<ReturnType<ProductService['catalogForAgent']>>
export type AgentCatalogProduct = AgentCatalog[number]
