import { z } from 'zod'
import type { Db } from '@vox/db'
import { addDays, formatInZone } from '@vox/shared'
import { ProductService, type AgentCatalog } from '../../catalog/product-service.js'
import { KnowledgeSearchService, type SearchHit } from '../../knowledge/search-service.js'
import { AppointmentService } from '../../scheduling/appointment-service.js'
import type { Providers } from '../../providers/index.js'
import type { AvailableSlot } from '../../providers/calendar.js'
import type { TenantContext } from '../../tenant/context.js'

/**
 * Deterministic tool layer. Tools are invoked by the orchestrator (never by free-form LLM calls),
 * validated with Zod, scoped by TenantContext and recorded as ToolCall rows for audit.
 */
export interface ToolContext {
  db: Db
  providers: Providers
  ctx: TenantContext
  unitId: string
  contactId: string
  leadId: string | null
  timezone: string
}

export const ToolSchemas = {
  get_catalog: z.object({}),
  get_product_offer: z.object({ productSlug: z.string() }),
  search_knowledge: z.object({ query: z.string().min(2), productId: z.string().uuid().optional(), limit: z.number().int().min(1).max(10).default(6) }),
  get_available_slots: z.object({ fromIso: z.string().optional(), days: z.number().int().min(1).max(30).default(7), durationMin: z.number().int().optional() }),
  create_appointment: z.object({ isoStart: z.string(), kind: z.enum(['visit', 'trial_class', 'meeting', 'call']).default('visit'), title: z.string().optional() }),
} as const

export type ToolName = keyof typeof ToolSchemas

export interface ToolResult<T = unknown> {
  name: ToolName
  input: unknown
  output: T
  ms: number
  error?: string
}

export class AgentTools {
  constructor(private readonly t: ToolContext) {}

  private async run<T>(name: ToolName, input: unknown, fn: (parsed: unknown) => Promise<T>): Promise<ToolResult<T | null>> {
    const started = Date.now()
    try {
      const parsed = ToolSchemas[name].parse(input ?? {})
      const output = await fn(parsed)
      return { name, input: parsed, output, ms: Date.now() - started }
    } catch (err) {
      return { name, input, output: null, ms: Date.now() - started, error: (err as Error).message }
    }
  }

  getCatalog(): Promise<ToolResult<AgentCatalog | null>> {
    return this.run('get_catalog', {}, () => new ProductService(this.t.db).catalogForAgent(this.t.ctx, this.t.unitId))
  }

  getProductOffer(productSlug: string) {
    return this.run('get_product_offer', { productSlug }, async () => {
      const catalog = await new ProductService(this.t.db).catalogForAgent(this.t.ctx, this.t.unitId)
      return catalog.find((p) => p.slug === productSlug) ?? null
    })
  }

  searchKnowledge(query: string, opts: { productId?: string; limit?: number } = {}): Promise<ToolResult<SearchHit[] | null>> {
    return this.run('search_knowledge', { query, ...opts }, () =>
      new KnowledgeSearchService(this.t.db, this.t.providers.embedding).search({ tenantId: this.t.ctx.tenantId, unitId: this.t.unitId, query, productId: opts.productId ?? null, limit: opts.limit ?? 6 }),
    )
  }

  getAvailableSlots(opts: { fromIso?: string; days?: number; durationMin?: number } = {}): Promise<ToolResult<AvailableSlot[] | null>> {
    return this.run('get_available_slots', opts, async () => {
      const from = opts.fromIso ? new Date(opts.fromIso) : new Date()
      const to = addDays(from, opts.days ?? 7)
      const service = new AppointmentService(this.t.db, this.t.providers.calendar)
      return service.getAvailableSlots(this.t.ctx, this.t.unitId, { from, to, durationMin: opts.durationMin, limit: 24 })
    })
  }

  createAppointment(input: { isoStart: string; kind?: 'visit' | 'trial_class' | 'meeting' | 'call'; title?: string }) {
    return this.run('create_appointment', input, async () => {
      const service = new AppointmentService(this.t.db, this.t.providers.calendar)
      const startsAt = new Date(input.isoStart)
      const kindLabel: Record<string, string> = { visit: 'Visita à unidade', trial_class: 'Aula experimental', meeting: 'Reunião', call: 'Ligação' }
      return service.create(this.t.ctx, { unitId: this.t.unitId, contactId: this.t.contactId, leadId: this.t.leadId ?? undefined, kind: input.kind ?? 'visit', title: input.title ?? `${kindLabel[input.kind ?? 'visit']} — VOX2you`, startsAt })
    })
  }

  /** Human-readable slot list for the prompt (local timezone, max 8 options grouped by day). */
  static renderSlots(slots: AvailableSlot[], timezone: string, max = 8): string {
    if (!slots.length) return 'Nenhum horário disponível nos próximos dias (ofereça encaminhar para um consultor).'
    return slots
      .slice(0, max)
      .map((s) => `- ${formatInZone(s.start, timezone, "EEEE dd/MM 'às' HH:mm")} (iso: ${s.start.toISOString()})`)
      .join('\n')
  }

  /** Compact catalog for the system prompt. Full data stays in the tool output for validation. */
  static renderCatalog(catalog: AgentCatalog): string {
    return catalog
      .map((p) => {
        const offers = p.offers.length ? p.offers.map((o) => `${o.name}: ${o.display}${o.validTo ? ` (válido até ${o.validTo.slice(0, 10)})` : ''}`).join('; ') : 'sem oferta vigente cadastrada — NÃO cite valores'
        const classes = p.classes.length ? p.classes.map((c) => `${c.name} ${c.weekdays.join('/')} ${c.startTime}-${c.endTime} início ${c.startsOn}${c.seatsLeft ? ` (${c.seatsLeft} vagas)` : ' (turma cheia)'}`).join('; ') : 'sem turmas abertas cadastradas'
        return `• ${p.name} [${p.slug}] (${p.category}${p.modality ? `, ${p.modality}` : ''}${p.durationText ? `, ${p.durationText}` : ''})\n  Para: ${p.personas.join(', ') || '-'} | Dores: ${p.painsSolved.join(', ') || '-'}\n  ${p.shortDescription ?? ''}\n  Ofertas: ${offers}\n  Turmas: ${classes}\n  Argumentos: ${p.salesArguments.slice(0, 3).join(' | ')}`
      })
      .join('\n')
  }
}
