import type { Db, Prisma } from '@vox/db'
import { decryptJson, encryptJson } from '../auth/crypto.js'
import { ConflictError, NotFoundError, ValidationError } from '../errors.js'
import { INTEGRATION_KINDS, integrationKind, type IntegrationKindDef } from './kinds.js'

export interface SecretState {
  set: boolean
  /** Last characters of the stored secret, for recognition only. */
  hint: string | null
}

export interface IntegrationView {
  id: string
  kind: string
  unitId: string | null
  name: string
  status: string
  lastError: string | null
  lastSyncAt: Date | null
  updatedAt: Date
  config: Record<string, string>
  secrets: Record<string, SecretState>
}

type Row = Prisma.IntegrationGetPayload<Record<string, never>>

/**
 * Stores provider credentials entered in the CRM. Non-secret values go to `config`; secrets are
 * AES-256-GCM encrypted into `credentialsEnc` with APP_ENCRYPTION_KEY and never returned to clients.
 */
export class IntegrationService {
  constructor(
    private readonly db: Db,
    private readonly encryptionKey: string,
  ) {}

  kinds(): IntegrationKindDef[] {
    return INTEGRATION_KINDS
  }

  async list(tenantId: string, unitId?: string): Promise<IntegrationView[]> {
    const rows = await this.db.integration.findMany({
      where: { tenantId, ...(unitId ? { OR: [{ unitId: null }, { unitId }] } : {}) },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map((r) => this.view(r))
  }

  /** Decrypted values (config + secrets) for internal use only. */
  async values(
    tenantId: string,
    kind: string,
    unitId: string | null,
  ): Promise<{ row: Row; values: Record<string, string> } | null> {
    const row = await this.db.integration.findFirst({ where: { tenantId, kind, unitId } })
    if (!row) return null
    return { row, values: this.decrypt(row) }
  }

  async save(
    tenantId: string,
    kind: string,
    unitId: string | null,
    input: Record<string, string | undefined>,
  ): Promise<IntegrationView> {
    const def = integrationKind(kind)
    if (!def) throw new NotFoundError('Integration kind', kind)
    if (def.scope === 'unit' && !unitId)
      throw new ValidationError(`${def.label} é configurada por unidade (informe unitId)`)
    if (def.scope === 'tenant') unitId = null

    const existing = await this.db.integration.findFirst({ where: { tenantId, kind, unitId } })
    const current = existing ? this.decrypt(existing) : {}
    const merged: Record<string, string> = { ...current }
    for (const f of def.fields) {
      const v = input[f.key]
      // Empty secret = keep what is stored (the UI never shows secrets back)
      if (v === undefined || (f.secret && v === '')) continue
      if (v === '') delete merged[f.key]
      else merged[f.key] = v.trim()
    }
    for (const f of def.fields)
      if (f.required && !merged[f.key]) throw new ValidationError(`Campo obrigatório: ${f.label}`)
    if (kind === 'google_calendar') this.assertServiceAccount(merged['serviceAccountJson']!)

    const config: Record<string, string> = {}
    const secrets: Record<string, string> = {}
    for (const f of def.fields) {
      const v = merged[f.key]
      if (v === undefined) continue
      if (f.secret) secrets[f.key] = v
      else config[f.key] = v
    }
    const data = {
      name: def.label,
      status: 'configured',
      lastError: null,
      config: config as Prisma.InputJsonValue,
      credentialsEnc: Object.keys(secrets).length ? encryptJson(secrets, this.encryptionKey) : null,
    }
    const row = existing
      ? await this.db.integration.update({ where: { id: existing.id }, data })
      : await this.db.integration.create({ data: { tenantId, unitId, kind, ...data } })

    if (kind === 'whatsapp_meta' && unitId)
      await this.ensureWhatsAppChannel(tenantId, unitId, merged['phoneNumberId']!)
    return this.view(row)
  }

  async remove(tenantId: string, kind: string, unitId: string | null): Promise<void> {
    const def = integrationKind(kind)
    if (!def) throw new NotFoundError('Integration kind', kind)
    await this.db.integration.deleteMany({
      where: { tenantId, kind, unitId: def.scope === 'tenant' ? null : unitId },
    })
  }

  async setStatus(
    id: string,
    status: 'connected' | 'error' | 'configured',
    lastError?: string | null,
  ): Promise<void> {
    await this.db.integration.update({
      where: { id },
      data: {
        status,
        lastError: lastError ?? null,
        ...(status === 'connected' ? { lastSyncAt: new Date() } : {}),
      },
    })
  }

  /**
   * Environment overrides for the provider factory, built from everything configured for the tenant.
   * Unit-scoped kinds (WhatsApp, Google Calendar): the earliest configured unit wins for the
   * tenant-wide provider; per-channel routing for several numbers is handled by `Providers.messagingFor`.
   */
  async envOverrides(tenantId: string): Promise<Record<string, string>> {
    const rows = await this.db.integration.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    })
    const out: Record<string, string> = {}
    const seen = new Set<string>()
    for (const row of rows) {
      const def = integrationKind(row.kind)
      if (!def || seen.has(row.kind)) continue
      seen.add(row.kind)
      Object.assign(out, def.toEnv(this.decrypt(row)))
    }
    return out
  }

  /** Webhook verification handshake carries no tenant: accept any configured WhatsApp verify token. */
  async matchesAnyWhatsAppVerifyToken(token: string): Promise<boolean> {
    if (!token) return false
    const rows = await this.db.integration.findMany({ where: { kind: 'whatsapp_meta' } })
    return rows.some((r) => this.decrypt(r)['verifyToken'] === token)
  }

  private async ensureWhatsAppChannel(
    tenantId: string,
    unitId: string,
    phoneNumberId: string,
  ): Promise<void> {
    const other = await this.db.channel.findUnique({
      where: { kind_externalId: { kind: 'whatsapp', externalId: phoneNumberId } },
    })
    if (other && other.tenantId !== tenantId)
      throw new ConflictError(`O phone_number_id ${phoneNumberId} já está vinculado a outra conta`)
    if (other) {
      await this.db.channel.update({
        where: { id: other.id },
        data: { unitId, provider: 'meta', status: 'active', name: 'WhatsApp Meta' },
      })
      return
    }
    await this.db.channel.create({
      data: {
        tenantId,
        unitId,
        kind: 'whatsapp',
        provider: 'meta',
        externalId: phoneNumberId,
        name: 'WhatsApp Meta',
      },
    })
  }

  private assertServiceAccount(json: string): void {
    try {
      const raw = json.trim().startsWith('{') ? json : Buffer.from(json, 'base64').toString('utf8')
      const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string }
      if (!parsed.client_email || !parsed.private_key) throw new Error('missing fields')
    } catch {
      throw new ValidationError(
        'Service account inválida: cole o JSON completo (com client_email e private_key)',
      )
    }
  }

  private decrypt(row: Row): Record<string, string> {
    const config = (row.config as Record<string, string> | null) ?? {}
    const secrets = row.credentialsEnc
      ? decryptJson<Record<string, string>>(row.credentialsEnc, this.encryptionKey)
      : {}
    return { ...config, ...secrets }
  }

  private view(row: Row): IntegrationView {
    const def = integrationKind(row.kind)
    const secrets: Record<string, SecretState> = {}
    const stored = row.credentialsEnc
      ? decryptJson<Record<string, string>>(row.credentialsEnc, this.encryptionKey)
      : {}
    for (const f of def?.fields ?? []) {
      if (!f.secret) continue
      const v = stored[f.key]
      secrets[f.key] = { set: !!v, hint: v ? `••••${v.slice(-4)}` : null }
    }
    return {
      id: row.id,
      kind: row.kind,
      unitId: row.unitId,
      name: row.name,
      status: row.status,
      lastError: row.lastError,
      lastSyncAt: row.lastSyncAt,
      updatedAt: row.updatedAt,
      config: (row.config as Record<string, string> | null) ?? {},
      secrets,
    }
  }
}
