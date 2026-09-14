import type { Db } from '@vox/db'

export interface AutomationCondition {
  field: string // dot path inside event payload, e.g. "to" or "facts.0.key"
  op: 'eq' | 'neq' | 'in' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'exists'
  value?: unknown
}

export type AutomationAction =
  | { type: 'send_message'; text: string }
  | { type: 'send_template'; templateName: string; language?: string; variables?: string[] }
  | { type: 'assign_owner'; userId: string }
  | { type: 'change_stage'; stageKey: string }
  | { type: 'create_task'; title: string; assigneeId?: string; kind?: string; dueInHours?: number }
  | { type: 'schedule_followup'; hours: number; reason: string }
  | { type: 'call_webhook'; url: string; secret?: string }
  | { type: 'send_email'; to: string; subject: string; text: string }
  | { type: 'notify_user'; userId: string; message: string }
  | { type: 'add_tag'; tag: string }
  | { type: 'run_agent'; instruction?: string }

export interface DomainEventRow {
  id: string
  tenantId: string
  unitId: string | null
  type: string
  aggregateType: string
  aggregateId: string
  payload: unknown
  actor: string | null
}

export interface MatchedAutomation {
  automationId: string
  name: string
  actions: AutomationAction[]
}

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined), obj)
}

export function matchesConditions(payload: unknown, conditions: AutomationCondition[]): boolean {
  return conditions.every((c) => {
    const v = getPath(payload, c.field)
    switch (c.op) {
      case 'eq':
        return v === c.value
      case 'neq':
        return v !== c.value
      case 'in':
        return Array.isArray(c.value) && c.value.includes(v)
      case 'gt':
        return typeof v === 'number' && typeof c.value === 'number' && v > c.value
      case 'gte':
        return typeof v === 'number' && typeof c.value === 'number' && v >= c.value
      case 'lt':
        return typeof v === 'number' && typeof c.value === 'number' && v < c.value
      case 'lte':
        return typeof v === 'number' && typeof c.value === 'number' && v <= c.value
      case 'contains':
        return (typeof v === 'string' && typeof c.value === 'string' && v.includes(c.value)) || (Array.isArray(v) && v.includes(c.value))
      case 'exists':
        return v !== undefined && v !== null
      default:
        return false
    }
  })
}

/** Finds automations that should run for an event. Execution happens in the worker (needs queues/providers). */
export class AutomationEngine {
  constructor(private readonly db: Db) {}

  async match(event: DomainEventRow): Promise<MatchedAutomation[]> {
    const automations = await this.db.automation.findMany({
      where: { tenantId: event.tenantId, trigger: event.type, active: true, OR: [{ unitId: null }, { unitId: event.unitId ?? undefined }] },
    })
    return automations
      .filter((a) => matchesConditions(event.payload, (a.conditions as unknown as AutomationCondition[]) ?? []))
      .map((a) => ({ automationId: a.id, name: a.name, actions: (a.actions as unknown as AutomationAction[]) ?? [] }))
  }

  async recordRun(automationId: string, eventId: string, status: 'success' | 'failed' | 'skipped', result?: unknown, error?: string) {
    await this.db.automationRun.create({ data: { automationId, eventId, status, result: (result ?? undefined) as object | undefined, error: error ?? null } })
  }
}
