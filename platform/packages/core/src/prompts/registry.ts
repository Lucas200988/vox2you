import type { Db, DbTx } from '@vox/db'
import type { PromptKey } from '@vox/shared'
import { PROMPT_KEYS } from '@vox/shared'
import { DEFAULT_PROMPTS } from './defaults.js'
import { NotFoundError, ValidationError } from '../errors.js'
import type { TenantContext } from '../tenant/context.js'
import { emitEvent } from '../events/outbox.js'

export interface ResolvedPrompt {
  key: PromptKey
  version: number
  content: string
  model: string | null
  source: 'tenant' | 'platform' | 'code'
}

/**
 * Versioned prompt registry. Resolution order: tenant production → platform production → code default.
 * Small in-memory cache (TTL) so publishing takes effect without restart.
 */
export class PromptRegistry {
  private cache = new Map<string, { value: ResolvedPrompt; expires: number }>()
  constructor(
    private readonly db: Db | DbTx,
    private readonly ttlMs = 15_000,
  ) {}

  async resolve(tenantId: string, key: PromptKey, env: 'production' | 'staging' = 'production', version?: number): Promise<ResolvedPrompt> {
    const cacheKey = `${tenantId}:${key}:${env}:${version ?? ''}`
    const hit = this.cache.get(cacheKey)
    if (hit && hit.expires > Date.now()) return hit.value

    const statuses = env === 'staging' ? ['staging', 'production'] : ['production']
    const candidates = await this.db.promptVersion.findMany({
      where: {
        prompt: { key, OR: [{ tenantId }, { tenantId: null }] },
        ...(version ? { version } : { status: { in: statuses } }),
      },
      include: { prompt: { select: { tenantId: true } } },
      orderBy: [{ version: 'desc' }],
    })
    // prefer tenant-specific, then staging over production when env=staging
    const pick =
      candidates.find((c) => c.prompt.tenantId === tenantId && c.status === env) ??
      candidates.find((c) => c.prompt.tenantId === tenantId) ??
      candidates.find((c) => c.prompt.tenantId === null && c.status === env) ??
      candidates.find((c) => c.prompt.tenantId === null)

    let value: ResolvedPrompt
    if (pick) {
      value = { key, version: pick.version, content: pick.content, model: pick.model, source: pick.prompt.tenantId ? 'tenant' : 'platform' }
    } else {
      const def = DEFAULT_PROMPTS[key]
      value = { key, version: 0, content: def.content, model: null, source: 'code' }
    }
    this.cache.set(cacheKey, { value, expires: Date.now() + this.ttlMs })
    return value
  }

  invalidate(): void {
    this.cache.clear()
  }

  /** Renders {{variables}}; unknown variables become empty strings (never leak template markers). */
  static render(template: string, vars: Record<string, string | number | null | undefined>): string {
    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, name: string) => {
      const v = vars[name]
      return v === null || v === undefined ? '' : String(v)
    })
  }

  static async seedDefaults(tx: DbTx): Promise<void> {
    for (const key of PROMPT_KEYS) {
      const def = DEFAULT_PROMPTS[key]
      // composite unique with NULL tenantId does not match in Postgres → find/create
      const prompt = (await tx.prompt.findFirst({ where: { tenantId: null, key } })) ?? (await tx.prompt.create({ data: { tenantId: null, key, description: def.description } }))
      const existing = await tx.promptVersion.findFirst({ where: { promptId: prompt.id, version: 1 } })
      if (!existing) {
        await tx.promptVersion.create({
          data: { promptId: prompt.id, version: 1, status: 'production', content: def.content, variables: def.variables, notes: 'Versão inicial da plataforma', publishedAt: new Date() },
        })
      }
    }
  }
}

export class PromptAdminService {
  constructor(private readonly db: Db) {}

  async list(ctx: TenantContext) {
    const prompts = await this.db.prompt.findMany({
      where: { OR: [{ tenantId: ctx.tenantId }, { tenantId: null }] },
      include: { versions: { orderBy: { version: 'desc' }, include: { author: { select: { name: true } } } } },
      orderBy: { key: 'asc' },
    })
    // collapse: tenant-specific overrides platform
    const byKey = new Map<string, (typeof prompts)[number]>()
    for (const p of prompts) {
      const cur = byKey.get(p.key)
      if (!cur || (cur.tenantId === null && p.tenantId !== null)) byKey.set(p.key, p)
    }
    return [...byKey.values()]
  }

  /** Creates a new draft version under the tenant's prompt (copying platform prompt on first edit). */
  async createDraft(ctx: TenantContext, key: PromptKey, input: { content: string; notes?: string; model?: string }) {
    if (!PROMPT_KEYS.includes(key)) throw new ValidationError('Unknown prompt key')
    return this.db.$transaction(async (tx) => {
      let prompt = await tx.prompt.findFirst({ where: { tenantId: ctx.tenantId, key } })
      if (!prompt) prompt = await tx.prompt.create({ data: { tenantId: ctx.tenantId, key, description: DEFAULT_PROMPTS[key].description } })
      const last = await tx.promptVersion.findFirst({ where: { promptId: prompt.id }, orderBy: { version: 'desc' } })
      const version = await tx.promptVersion.create({
        data: { promptId: prompt.id, version: (last?.version ?? 0) + 1, status: 'draft', content: input.content, notes: input.notes ?? null, model: input.model ?? null, authorId: ctx.userId ?? null, variables: DEFAULT_PROMPTS[key].variables },
      })
      await tx.auditLog.create({ data: { tenantId: ctx.tenantId, userId: ctx.userId ?? null, actor: ctx.actor, action: 'prompt.draft', entityType: 'prompt_version', entityId: version.id } })
      return version
    })
  }

  async setStatus(ctx: TenantContext, versionId: string, status: 'draft' | 'staging' | 'production' | 'archived') {
    return this.db.$transaction(async (tx) => {
      const version = await tx.promptVersion.findFirst({ where: { id: versionId, prompt: { tenantId: ctx.tenantId } }, include: { prompt: true } })
      if (!version) throw new NotFoundError('PromptVersion', versionId)
      if (status === 'production' || status === 'staging') {
        await tx.promptVersion.updateMany({ where: { promptId: version.promptId, status, NOT: { id: versionId } }, data: { status: 'archived' } })
      }
      const updated = await tx.promptVersion.update({ where: { id: versionId }, data: { status, ...(status === 'production' ? { publishedAt: new Date() } : {}) } })
      await tx.auditLog.create({ data: { tenantId: ctx.tenantId, userId: ctx.userId ?? null, actor: ctx.actor, action: `prompt.${status}`, entityType: 'prompt_version', entityId: versionId, after: { key: version.prompt.key, version: version.version } } })
      if (status === 'production') {
        await emitEvent(tx, { type: 'prompt.published', tenantId: ctx.tenantId, aggregateType: 'prompt', aggregateId: version.promptId, payload: { key: version.prompt.key, version: version.version }, actor: ctx.actor })
      }
      return updated
    })
  }

  /** Rollback = re-publish an older version (creates audit trail). */
  async rollback(ctx: TenantContext, versionId: string) {
    return this.setStatus(ctx, versionId, 'production')
  }
}
