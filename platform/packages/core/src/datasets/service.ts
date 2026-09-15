import type { Db, Prisma } from '@vox/db'
import { NotFoundError, ValidationError } from '../errors.js'
import { AgentOrchestrator } from '../agent/orchestrator.js'
import { openSandboxConversation } from '../agent/sandbox.js'
import type { AgentDeps, AgentRunResult } from '../agent/types.js'
import { ConversationService } from '../crm/conversation-service.js'
import { LeadService } from '../crm/lead-service.js'
import type { TenantContext } from '../tenant/context.js'

export interface DatasetItemInput {
  /** Customer message to send (the last turn) */
  text: string
  /** Facts seeded on the sandbox lead before the run */
  facts?: Array<{ key: string; value: string }>
  /** Earlier customer turns replayed before `text` (each one is answered by the agent) */
  history?: string[]
}
export interface DatasetExpectation {
  intent?: string
  decision?: 'reply' | 'handoff' | 'silent' | 'template_required' | 'blocked'
  mustInclude?: string[]
  mustNotInclude?: string[]
  /** Regexes (case-insensitive) the reply must not match, e.g. "R\\$" in SDR mode */
  mustNotMatch?: string[]
  validationOk?: boolean
}
export interface RunConfig {
  unitId: string
  label?: string
  promptVersion?: number
  model?: string
  persona?: string
  env?: 'production' | 'staging'
}
export interface ItemResult {
  itemId: string
  text: string
  reply: string | null
  decision: string
  intent: string | null
  latencyMs: number
  costUsd: number
  validationOk: boolean | null
  passed: boolean
  failures: string[]
  conversationId: string
}
export interface RunSummary {
  config: RunConfig
  items: number
  passed: number
  passRate: number
  avgLatencyMs: number
  totalCostUsd: number
  blocked: number
  handoffs: number
  results: ItemResult[]
}

/**
 * Regression datasets for the agent: saved customer turns with expectations, runnable against any
 * prompt version/model in sandbox conversations, and comparable A/B. Runs are not persisted as a
 * table; every turn leaves an AgentRun(kind=playground) behind for auditing.
 */
export class DatasetService {
  constructor(
    private readonly db: Db,
    private readonly deps: AgentDeps,
  ) {}

  list(ctx: TenantContext) {
    return this.db.dataset.findMany({
      where: { tenantId: ctx.tenantId },
      include: { _count: { select: { items: true } } },
      orderBy: { createdAt: 'desc' },
    })
  }

  async get(ctx: TenantContext, id: string) {
    const d = await this.db.dataset.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    })
    if (!d) throw new NotFoundError('Dataset', id)
    return d
  }

  create(ctx: TenantContext, input: { name: string; description?: string }) {
    return this.db.dataset.create({
      data: { tenantId: ctx.tenantId, name: input.name, description: input.description ?? null },
    })
  }

  async remove(ctx: TenantContext, id: string) {
    await this.get(ctx, id)
    await this.db.dataset.delete({ where: { id } })
  }

  async addItem(
    ctx: TenantContext,
    datasetId: string,
    input: DatasetItemInput,
    expected?: DatasetExpectation,
    source = 'manual',
  ) {
    await this.get(ctx, datasetId)
    if (!input.text?.trim()) throw new ValidationError('Texto do cliente obrigatório')
    return this.db.datasetItem.create({
      data: {
        datasetId,
        input: input as unknown as Prisma.InputJsonValue,
        expected: (expected ?? null) as Prisma.InputJsonValue,
        source,
      },
    })
  }

  async updateItem(
    ctx: TenantContext,
    datasetId: string,
    itemId: string,
    patch: { input?: DatasetItemInput; expected?: DatasetExpectation | null },
  ) {
    await this.get(ctx, datasetId)
    return this.db.datasetItem.update({
      where: { id: itemId },
      data: {
        ...(patch.input ? { input: patch.input as unknown as Prisma.InputJsonValue } : {}),
        ...(patch.expected !== undefined
          ? { expected: patch.expected as Prisma.InputJsonValue }
          : {}),
      },
    })
  }

  async removeItem(ctx: TenantContext, datasetId: string, itemId: string) {
    await this.get(ctx, datasetId)
    await this.db.datasetItem.deleteMany({ where: { id: itemId, datasetId } })
  }

  /** Turns the last customer turn of a conversation (playground or real) into a dataset item. */
  async addFromConversation(
    ctx: TenantContext,
    datasetId: string,
    conversationId: string,
    expected?: DatasetExpectation,
  ) {
    const conv = await this.db.conversation.findFirst({
      where: { id: conversationId, tenantId: ctx.tenantId },
      include: {
        messages: {
          where: { direction: 'inbound' },
          orderBy: { createdAt: 'asc' },
          select: { text: true },
        },
        lead: {
          include: { facts: { where: { status: 'active' }, select: { key: true, value: true } } },
        },
      },
    })
    if (!conv) throw new NotFoundError('Conversation', conversationId)
    const turns = conv.messages.map((m) => m.text).filter((t): t is string => !!t?.trim())
    if (!turns.length) throw new ValidationError('A conversa não tem mensagens do cliente')
    const text = turns[turns.length - 1]!
    const history = turns.slice(0, -1).slice(-6)
    return this.addItem(
      ctx,
      datasetId,
      { text, history, facts: conv.lead?.facts ?? [] },
      expected,
      `conversation:${conversationId}`,
    )
  }

  /** One sandbox turn (used by the playground A/B compare and by dataset runs). */
  async runTurn(
    ctx: TenantContext,
    config: RunConfig,
    input: DatasetItemInput,
    conversationId?: string,
  ) {
    const conversations = new ConversationService(this.db)
    let conversation = await openSandboxConversation(this.db, ctx, config.unitId, {
      conversationId,
      label: config.label ?? 'Dataset',
    })
    if (input.facts?.length && conversation.leadId && !conversationId) {
      await this.db.$transaction((tx) =>
        LeadService.upsertFactsTx(
          tx,
          ctx,
          conversation.leadId!,
          input.facts!.map((f) => ({ ...f, source: 'confirmed' as const })),
        ),
      )
    }
    let last: AgentRunResult | null = null
    for (const turn of [...(input.history ?? []), input.text]) {
      const { message } = await this.db.$transaction((tx) =>
        conversations.appendMessage(tx, ctx, conversation.id, {
          direction: 'inbound',
          type: 'text',
          authorType: 'contact',
          text: turn,
          status: 'received',
        }),
      )
      last = await new AgentOrchestrator(this.deps).run({
        tenantId: ctx.tenantId,
        unitId: config.unitId,
        conversationId: conversation.id,
        inboundMessageId: message.id,
        text: turn,
        kind: 'playground',
        env: config.env,
        overrides: {
          persona: config.persona,
          promptVersion: config.promptVersion,
          model: config.model,
        },
        dryRun: false,
      })
      if (last.reply && !last.outboundMessageId) {
        await this.db.$transaction((tx) =>
          conversations.appendMessage(tx, ctx, conversation.id, {
            direction: 'outbound',
            type: 'text',
            authorType: 'agent',
            text: last!.reply,
            status: 'sent',
            agentRunId: last!.runId,
          }),
        )
      }
      conversation =
        (await this.db.conversation.findUnique({ where: { id: conversation.id } })) ?? conversation
    }
    return { conversation, run: last! }
  }

  async run(ctx: TenantContext, datasetId: string, config: RunConfig): Promise<RunSummary> {
    const dataset = await this.get(ctx, datasetId)
    const results: ItemResult[] = []
    for (const item of dataset.items) {
      const input = item.input as unknown as DatasetItemInput
      const expected = (item.expected ?? {}) as DatasetExpectation
      const { conversation, run } = await this.runTurn(ctx, config, input)
      const failures = check(run, expected)
      results.push({
        itemId: item.id,
        text: input.text,
        reply: run.reply,
        decision: run.decision,
        intent: run.classification?.intent ?? null,
        latencyMs: run.latencyMs,
        costUsd: run.usage.costUsd,
        validationOk: run.validation?.ok ?? null,
        passed: failures.length === 0,
        failures,
        conversationId: conversation.id,
      })
    }
    const passed = results.filter((r) => r.passed).length
    return {
      config,
      items: results.length,
      passed,
      passRate: results.length ? passed / results.length : 0,
      avgLatencyMs: results.length
        ? results.reduce((s, r) => s + r.latencyMs, 0) / results.length
        : 0,
      totalCostUsd: results.reduce((s, r) => s + r.costUsd, 0),
      blocked: results.filter((r) => r.decision === 'blocked').length,
      handoffs: results.filter((r) => r.decision === 'handoff').length,
      results,
    }
  }

  async compare(ctx: TenantContext, datasetId: string, a: RunConfig, b: RunConfig) {
    const [ra, rb] = [
      await this.run(ctx, datasetId, { label: 'A', ...a }),
      await this.run(ctx, datasetId, { label: 'B', ...b }),
    ]
    const diffs = ra.results.map((x, i) => {
      const y = rb.results[i]!
      return {
        itemId: x.itemId,
        text: x.text,
        a: x,
        b: y,
        changed:
          x.passed !== y.passed || x.decision !== y.decision || (x.reply ?? '') !== (y.reply ?? ''),
      }
    })
    return {
      a: ra,
      b: rb,
      diffs,
      winner: ra.passRate === rb.passRate ? 'tie' : ra.passRate > rb.passRate ? 'A' : 'B',
    }
  }
}

/** Expectation checks; every failed rule is reported (not just the first). */
export function check(run: AgentRunResult, expected: DatasetExpectation): string[] {
  const failures: string[] = []
  const reply = run.reply ?? ''
  const lower = reply.toLowerCase()
  if (expected.intent && run.classification?.intent !== expected.intent)
    failures.push(`intenção ${run.classification?.intent ?? '—'} ≠ ${expected.intent}`)
  if (expected.decision && run.decision !== expected.decision)
    failures.push(`decisão ${run.decision} ≠ ${expected.decision}`)
  for (const s of expected.mustInclude ?? [])
    if (!lower.includes(s.toLowerCase())) failures.push(`faltou "${s}"`)
  for (const s of expected.mustNotInclude ?? [])
    if (lower.includes(s.toLowerCase())) failures.push(`não deveria conter "${s}"`)
  for (const re of expected.mustNotMatch ?? []) {
    try {
      if (new RegExp(re, 'i').test(reply)) failures.push(`não deveria casar /${re}/`)
    } catch {
      failures.push(`regex inválida /${re}/`)
    }
  }
  if (expected.validationOk !== undefined && (run.validation?.ok ?? null) !== expected.validationOk)
    failures.push(`validação ${run.validation?.ok ?? '—'} ≠ ${expected.validationOk}`)
  return failures
}
