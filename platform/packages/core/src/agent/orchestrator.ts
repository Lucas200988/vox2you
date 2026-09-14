import type { DbTx, Prisma } from '@vox/db'
import {
  ClassificationSchema,
  ExtractionSchema,
  GenerationSchema,
  ValidationResultSchema,
  detectOptOut,
  formatInZone,
  isWithinRules,
  newId,
  normalizeWhitespace,
  wrapUntrusted,
  type AgentAction,
  type Classification,
  type ValidationIssue,
} from '@vox/shared'
import { callJson } from './llm-json.js'
import { runGuardrails } from './guardrails.js'
import {
  loadMemory,
  renderFacts,
  renderHistory,
  renderLeadProfile,
  ConversationSummarizer,
} from './memory.js'
import { AgentTools } from './tools/index.js'
import type { AgentContext, AgentDeps, AgentRunInput, AgentRunResult, StepRecord } from './types.js'
import { ProductService } from '../catalog/product-service.js'
import { ConsentService } from '../crm/consent-service.js'
import { ConversationService } from '../crm/conversation-service.js'
import { LeadService } from '../crm/lead-service.js'
import { emitEvent } from '../events/outbox.js'
import { FollowUpService, loadFollowUpPolicy } from '../followup/service.js'
import { planFollowUp } from '../followup/planner.js'
import { evaluateHandoff } from '../handoff/rules.js'
import { KnowledgeSearchService } from '../knowledge/search-service.js'
import { PromptRegistry } from '../prompts/registry.js'
import { SalesBrainService } from '../sales-brain/service.js'
import { AppointmentService } from '../scheduling/appointment-service.js'
import { computeLeadScore, DEFAULT_SCORING_WEIGHTS } from '../scoring/lead-scoring.js'
import { loadAgentSettings } from '../settings/agent-settings.js'
import { agentContext } from '../tenant/context.js'
import { isSessionWindowOpen } from '../window/policy.js'

const COMMERCIAL_INTENTS = new Set([
  'info_request',
  'price_request',
  'schedule_request',
  'booking_request',
  'objection',
  'buying_signal',
  'b2b_inquiry',
  'follow_up_reply',
])
const HANDOFF_BRIDGE =
  'Perfeito. Vou te passar para um(a) consultor(a) da nossa equipe, que continua daqui com você em instantes.'
const SAFE_FALLBACK =
  'Deixa eu confirmar essa informação certinha com a equipe para não te passar nada errado. Já te retorno por aqui.'
const OPT_OUT_ACK =
  'Entendido, não vou mais te enviar mensagens. Se precisar de algo no futuro, é só chamar por aqui.'

/**
 * AgentOrchestrator — state machine that runs the reasoning pipeline for one inbound message.
 * Each step is timed, traced and recorded in AgentRun for auditing. Expensive steps are skipped
 * when the classification says they are unnecessary.
 */
export class AgentOrchestrator {
  constructor(private readonly deps: AgentDeps) {}

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const ctx = await this.init(input)
    const tctx = agentContext(input.tenantId)
    const { db, logger } = this.deps
    try {
      await this.step(ctx, 'normalize', async () => this.normalize(ctx))
      const gated = await this.step(ctx, 'gate', async () => this.gate(ctx))
      if (!gated) {
        await this.step(ctx, 'classify', async () => this.classify(ctx))
        const c = ctx.classification!
        const shouldExtract =
          ctx.text.length > 12 &&
          !['greeting', 'smalltalk', 'opt_out', 'off_topic'].includes(c.intent)
        await this.step(
          ctx,
          'extract',
          async () =>
            shouldExtract
              ? this.extract(ctx)
              : (ctx.extraction = { facts: [], invalidatedKeys: [] }),
          !shouldExtract,
        )
        await this.step(ctx, 'stage', async () => this.suggestStage(ctx))
        const handoff = await this.step(ctx, 'handoff_rules', async () => this.checkHandoff(ctx))
        if (handoff) {
          ctx.decision = 'handoff'
          ctx.finalReply = HANDOFF_BRIDGE
        } else {
          await this.step(
            ctx,
            'retrieve',
            async () => this.retrieve(ctx),
            !c.needsKnowledge && !['info_request', 'objection', 'b2b_inquiry'].includes(c.intent),
          )
          await this.step(ctx, 'tools', async () => this.tools(ctx))
          await this.step(ctx, 'generate', async () => this.generate(ctx))
          await this.step(ctx, 'validate', async () => this.validate(ctx))
          await this.step(
            ctx,
            'llm_verify',
            async () => this.llmVerify(ctx),
            !this.needsLlmVerify(ctx),
          )
          await this.step(ctx, 'actions', async () => this.applyActions(ctx))
        }
      }
      const outboundMessageId = await this.step(
        ctx,
        'send',
        async () => this.send(ctx),
        input.dryRun === true,
      )
      const crm = await this.step(ctx, 'update_crm', async () => this.updateCrm(ctx))
      await this.step(ctx, 'summarize', async () => this.maybeSummarize(ctx), input.dryRun === true)

      const latencyMs = Date.now() - ctx.startedAt
      await db.agentRun.update({
        where: { id: ctx.runId },
        data: {
          status: 'completed',
          completedAt: new Date(),
          classification: (ctx.classification ?? undefined) as Prisma.InputJsonValue | undefined,
          extractedFacts: (ctx.extraction ?? undefined) as Prisma.InputJsonValue | undefined,
          retrieval: {
            query: ctx.text,
            hits: ctx.knowledge.map((k) => ({
              chunkId: k.chunkId,
              title: k.title,
              score: k.score,
            })),
            slots: ctx.slots?.length ?? 0,
            catalog: !!ctx.catalog,
          } as Prisma.InputJsonValue,
          sourceIds: ctx.knowledge.map((k) => k.chunkId),
          retrievalScore: ctx.retrievalConfidence,
          confidence: ctx.confidence,
          decision: ctx.decision,
          decisionReason: ctx.decisionReason,
          validation: (ctx.validation ?? undefined) as Prisma.InputJsonValue | undefined,
          replyText: ctx.finalReply,
          steps: ctx.steps as unknown as Prisma.InputJsonValue,
          model: ctx.model,
          inputTokens: ctx.usage.inputTokens,
          outputTokens: ctx.usage.outputTokens,
          costUsd: ctx.usage.costUsd,
          latencyMs,
          promptVersions: ctx.promptVersions,
          salesBrainVersion: ctx.salesBrainVersion,
          knowledgeVersion: ctx.knowledge.length
            ? ctx.knowledge.map((k) => `${k.documentId.slice(0, 8)}:v${k.version}`).join(',')
            : null,
          leadId: ctx.memory.lead?.id ?? null,
          toolCalls: {
            create: ctx.toolCalls.map((t) => ({
              name: t.name,
              input: t.input as Prisma.InputJsonValue,
              output: (t.output ?? undefined) as Prisma.InputJsonValue | undefined,
              error: t.error ?? null,
              durationMs: t.ms,
            })),
          },
        },
      })
      ctx.trace.end({
        output: { decision: ctx.decision, reply: ctx.finalReply, confidence: ctx.confidence },
        metadata: { costUsd: ctx.usage.costUsd, latencyMs },
      })
      if (ctx.decision === 'blocked') {
        await db.$transaction((tx) =>
          emitEvent(tx, {
            type: 'agent.validation_blocked',
            tenantId: input.tenantId,
            unitId: input.unitId,
            aggregateType: 'conversation',
            aggregateId: input.conversationId,
            payload: { runId: ctx.runId, issues: ctx.validation?.issues ?? [] },
            actor: 'agent',
          }),
        )
      }
      await db.$transaction((tx) =>
        emitEvent(tx, {
          type: 'agent.run_completed',
          tenantId: input.tenantId,
          unitId: input.unitId,
          aggregateType: 'conversation',
          aggregateId: input.conversationId,
          payload: {
            runId: ctx.runId,
            decision: ctx.decision,
            intent: ctx.classification?.intent ?? null,
            costUsd: ctx.usage.costUsd,
            latencyMs,
            leadId: ctx.memory.lead?.id ?? null,
            contactId: ctx.memory.contact.id,
          },
          actor: 'agent',
        }),
      )
      void this.deps.providers.trace.flush().catch(() => undefined)

      return {
        runId: ctx.runId,
        decision: ctx.decision,
        decisionReason: ctx.decisionReason,
        reply: ctx.finalReply,
        actions: ctx.actions,
        classification: ctx.classification,
        extraction: ctx.extraction,
        validation: ctx.validation,
        confidence: ctx.confidence,
        retrievalConfidence: ctx.retrievalConfidence,
        sourceIds: ctx.knowledge.map((k) => k.chunkId),
        knowledge: ctx.knowledge.map((k) => ({
          chunkId: k.chunkId,
          title: k.title,
          score: k.score,
        })),
        catalogUsed: !!ctx.catalog,
        slots: ctx.slots,
        steps: ctx.steps,
        usage: ctx.usage,
        latencyMs,
        model: ctx.model,
        handoffReason: ctx.handoffReason,
        outboundMessageId: outboundMessageId ?? null,
        leadId: ctx.memory.lead?.id ?? null,
        score: crm?.score ?? null,
        scoreReasons: crm?.scoreReasons ?? [],
        stage: crm?.stage ?? ctx.memory.lead?.stageKey ?? null,
        nextBestAction: crm?.nextBestAction ?? null,
        followUpAt: crm?.followUpAt ?? null,
      }
    } catch (err) {
      logger.error(
        { err, runId: ctx.runId, conversationId: input.conversationId },
        'agent run failed',
      )
      await db.agentRun
        .update({
          where: { id: ctx.runId },
          data: {
            status: 'failed',
            error: (err as Error).message,
            completedAt: new Date(),
            steps: ctx.steps as unknown as Prisma.InputJsonValue,
            latencyMs: Date.now() - ctx.startedAt,
          },
        })
        .catch(() => undefined)
      ctx.trace.end({ level: 'ERROR', statusMessage: (err as Error).message })
      throw err
    } finally {
      // tctx retained for future per-run auditing hooks
      void tctx
    }
  }

  // ───────────────────────────── init & helpers ─────────────────────────────

  private async init(input: AgentRunInput): Promise<AgentContext> {
    const { db, providers, prompts } = this.deps
    const unit = await db.unit.findFirst({
      where: { id: input.unitId, tenantId: input.tenantId },
      select: { id: true, name: true, city: true, timezone: true },
    })
    if (!unit) throw new Error(`Unit ${input.unitId} not found for tenant`)
    const settings = await loadAgentSettings(db, input.unitId, providers.models)
    if (input.overrides?.persona) settings.persona = input.overrides.persona
    if (input.overrides?.model)
      settings.models = { ...settings.models, generate: input.overrides.model }
    const { brain, version } = await new SalesBrainService(db).resolve(
      input.unitId,
      input.env ?? 'production',
    )
    const memory = await loadMemory(db, input.conversationId)
    const runId = newId()
    await db.agentRun.create({
      data: {
        id: runId,
        tenantId: input.tenantId,
        unitId: input.unitId,
        conversationId: input.conversationId,
        leadId: memory.lead?.id ?? null,
        inboundMessageId: input.inboundMessageId ?? null,
        kind: input.kind,
        status: 'running',
      },
    })
    const trace = providers.trace.startTrace({
      traceId: runId,
      name: `agent.${input.kind}`,
      tenantId: input.tenantId,
      unitId: input.unitId,
      conversationId: input.conversationId,
      leadId: memory.lead?.id,
      messageId: input.inboundMessageId ?? undefined,
      metadata: { env: input.env ?? 'production' },
    })
    await db.agentRun.update({ where: { id: runId }, data: { traceId: trace.traceId } })
    void prompts
    return {
      input,
      deps: this.deps,
      runId,
      startedAt: Date.now(),
      trace,
      settings,
      unit,
      salesBrain: brain,
      salesBrainVersion: version,
      promptVersions: {},
      text: input.text,
      memory,
      classification: null,
      extraction: null,
      catalog: null,
      knowledge: [],
      retrievalConfidence: 0,
      slots: null,
      generation: null,
      validation: null,
      finalReply: null,
      actions: [],
      decision: 'reply',
      decisionReason: null,
      confidence: 0,
      steps: [],
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      model: null,
      handoffReason: null,
      stageSuggestion: null,
      toolCalls: [],
    }
  }

  private async step<T>(
    ctx: AgentContext,
    name: string,
    fn: () => Promise<T>,
    skip = false,
  ): Promise<T | undefined> {
    const started = Date.now()
    if (skip) {
      ctx.steps.push({ name, ms: 0, skipped: true })
      return undefined
    }
    const span = ctx.trace.span({ name })
    try {
      const result = await fn()
      const rec: StepRecord = { name, ms: Date.now() - started }
      ctx.steps.push(rec)
      span.end({ output: summarizeForTrace(result) })
      return result
    } catch (err) {
      ctx.steps.push({ name, ms: Date.now() - started, note: `error: ${(err as Error).message}` })
      span.end({ level: 'ERROR', statusMessage: (err as Error).message })
      throw err
    }
  }

  private account(
    ctx: AgentContext,
    stepName: string,
    res: { usage: { inputTokens: number; outputTokens: number }; costUsd: number; model: string },
  ) {
    ctx.usage.inputTokens += res.usage.inputTokens
    ctx.usage.outputTokens += res.usage.outputTokens
    ctx.usage.costUsd += res.costUsd
    const rec = ctx.steps.find((s) => s.name === stepName)
    if (rec)
      Object.assign(rec, {
        model: res.model,
        tokensIn: res.usage.inputTokens,
        tokensOut: res.usage.outputTokens,
        costUsd: res.costUsd,
      })
    ctx.trace
      .generation({ name: stepName, model: res.model })
      .end({ model: res.model, usage: res.usage, costUsd: res.costUsd })
  }

  private async prompt(ctx: AgentContext, key: Parameters<PromptRegistry['resolve']>[1]) {
    const p = await this.deps.prompts.resolve(
      ctx.input.tenantId,
      key,
      ctx.input.env ?? 'production',
      key === 'conversation.system' ? ctx.input.overrides?.promptVersion : undefined,
    )
    ctx.promptVersions[key] = p.version
    return p
  }

  // ───────────────────────────── steps ─────────────────────────────

  private normalize(ctx: AgentContext) {
    ctx.text = normalizeWhitespace(ctx.input.text).slice(0, 4000)
  }

  /** Returns true when the pipeline must stop before classification. */
  private async gate(ctx: AgentContext): Promise<boolean> {
    const { db } = this.deps
    const m = ctx.memory
    if (ctx.input.kind !== 'playground' && m.conversation.mode !== 'ai') {
      ctx.decision = 'silent'
      ctx.decisionReason = `conversation_mode:${m.conversation.mode}`
      return true
    }
    if (!ctx.settings.enabled && ctx.input.kind !== 'playground') {
      ctx.decision = 'silent'
      ctx.decisionReason = 'agent_disabled'
      return true
    }
    if (detectOptOut(ctx.text)) {
      ctx.classification = {
        intent: 'opt_out',
        secondaryIntents: [],
        sentiment: 'neutral',
        urgency: 'low',
        signals: [],
        profileType: 'unknown',
        needsKnowledge: false,
        needsCatalog: false,
        needsCalendar: false,
        requestsHuman: false,
        isEmotional: false,
        mentionsProducts: [],
        confidence: 1,
      }
      ctx.finalReply = OPT_OUT_ACK
      ctx.decision = 'reply'
      ctx.decisionReason = 'opt_out'
      ctx.confidence = 1
      if (!ctx.input.dryRun) {
        await db.$transaction((tx) =>
          ConsentService.optOutMarketing(
            tx,
            agentContext(ctx.input.tenantId),
            m.contact.id,
            ctx.text,
          ),
        )
      }
      return true
    }
    if (
      ctx.input.kind !== 'playground' &&
      ctx.settings.businessHours.length &&
      !isWithinRules(new Date(), ctx.unit.timezone, ctx.settings.businessHours) &&
      ctx.settings.outOfHoursMessage
    ) {
      const recentOoh = m.recent.some(
        (r) =>
          r.direction === 'outbound' &&
          r.text === ctx.settings.outOfHoursMessage &&
          Date.now() - r.createdAt.getTime() < 12 * 36e5,
      )
      if (!recentOoh) {
        ctx.finalReply = ctx.settings.outOfHoursMessage
        ctx.decision = 'reply'
        ctx.decisionReason = 'out_of_hours'
        ctx.confidence = 1
        return true
      }
    }
    return false
  }

  private async classify(ctx: AgentContext) {
    const { providers, db } = this.deps
    const prompt = await this.prompt(ctx, 'classify.intent')
    const products = await db.product.findMany({
      where: {
        tenantId: ctx.input.tenantId,
        status: 'active',
        OR: [{ unitId: ctx.input.unitId }, { unitId: null }],
      },
      select: { slug: true, name: true },
    })
    const user = PromptRegistry.render(prompt.content, {
      products: products.map((p) => `${p.slug} (${p.name})`).join(', '),
      signals_catalog: SalesBrainService.signalsCatalog(ctx.salesBrain),
      facts: renderFacts(ctx.memory.facts),
      recent_history: renderHistory(ctx.memory.recent.slice(-8), 2500),
    })
    const res = await callJson(providers.llm, {
      model: ctx.settings.models.classify,
      task: 'classify',
      user: `${user}\n\n${wrapUntrusted('customer_message', ctx.text)}`,
      schema: ClassificationSchema,
      schemaName: 'classification',
      maxTokens: 512,
      metadata: { runId: ctx.runId },
    })
    this.account(ctx, 'classify', res.response)
    ctx.classification = res.data ?? {
      intent: 'unknown',
      secondaryIntents: [],
      sentiment: 'neutral',
      urgency: 'low',
      signals: [],
      profileType: 'unknown',
      needsKnowledge: true,
      needsCatalog: true,
      needsCalendar: false,
      requestsHuman: false,
      isEmotional: false,
      mentionsProducts: [],
      confidence: 0.3,
    }
    // Deterministic reinforcement of cheap signals
    const lower = ctx.text.toLowerCase()
    if (/\b(pre[cç]o|valor|quanto custa|investimento|mensalidade|parcel)/.test(lower))
      ctx.classification.needsCatalog = true
    if (/\b(hor[aá]rio|turma|dias?|quando come[cç]a|per[ií]odo)\b/.test(lower))
      ctx.classification.needsCatalog = true
    if (/\b(agendar|marcar|visita|aula experimental|conhecer a escola|passar a[ií])\b/.test(lower))
      ctx.classification.needsCalendar = true
    if (/\b(atendente|humano|pessoa|algu[eé]m da equipe|falar com algu[eé]m)\b/.test(lower))
      ctx.classification.requestsHuman = true
    if (
      /desconto|faz por menos|abatimento/.test(lower) &&
      !ctx.classification.signals.includes('discount_request')
    )
      ctx.classification.signals.push('discount_request')
  }

  private async extract(ctx: AgentContext) {
    const { providers, db } = this.deps
    const prompt = await this.prompt(ctx, 'extract.facts')
    const products = await db.product.findMany({
      where: {
        tenantId: ctx.input.tenantId,
        status: 'active',
        OR: [{ unitId: ctx.input.unitId }, { unitId: null }],
      },
      select: { slug: true, name: true },
    })
    const user = PromptRegistry.render(prompt.content, {
      known_facts: renderFacts(ctx.memory.facts),
      recent_history: renderHistory(ctx.memory.recent.slice(-6), 2000),
      products: products.map((p) => p.slug).join(', '),
    })
    const res = await callJson(providers.llm, {
      model: ctx.settings.models.extract,
      task: 'extract',
      user: `${user}\n\n${wrapUntrusted('customer_message', ctx.text)}`,
      schema: ExtractionSchema,
      schemaName: 'extraction',
      maxTokens: 600,
      metadata: { runId: ctx.runId },
    })
    this.account(ctx, 'extract', res.response)
    ctx.extraction = res.data ?? { facts: [], invalidatedKeys: [] }
    // Signal → fact mapping from the Sales Brain (deterministic, cheap)
    for (const sig of ctx.classification?.signals ?? []) {
      const def = ctx.salesBrain.signals.find((s) => s.key === sig)
      if (
        def?.factKey &&
        def.factValue &&
        !ctx.extraction.facts.some((f) => f.key === def.factKey && f.value === def.factValue)
      ) {
        ctx.extraction.facts.push({
          key: def.factKey as never,
          value: def.factValue,
          source: 'inferred',
          confidence: 0.6,
        })
      }
    }
    if (
      ctx.classification?.profileType === 'b2b' &&
      !ctx.extraction.facts.some((f) => f.key === 'profile_type')
    )
      ctx.extraction.facts.push({
        key: 'profile_type',
        value: 'b2b',
        source: 'inferred',
        confidence: 0.7,
      })
  }

  private suggestStage(ctx: AgentContext) {
    const c = ctx.classification!
    const facts = [
      ...ctx.memory.facts.map((f) => f.key),
      ...(ctx.extraction?.facts.map((f) => f.key) ?? []),
    ]
    let stage: string | null = null
    const sdr = ctx.settings.salesMode === 'sdr'
    // SDR: there is no "offer"/"negotiation" by chat — every commercial signal points to the visit.
    if (c.intent === 'buying_signal') stage = sdr ? 'scheduling' : 'negotiation'
    else if (c.intent === 'booking_request' || c.needsCalendar) stage = 'scheduling'
    else if (c.intent === 'price_request') stage = sdr ? 'discovery' : 'offer'
    else if (facts.includes('pain') || facts.includes('goal')) stage = 'discovery'
    else if (COMMERCIAL_INTENTS.has(c.intent) || c.intent === 'greeting') stage = 'conversing'
    ctx.stageSuggestion = stage
  }

  private checkHandoff(ctx: AgentContext): boolean {
    const c = ctx.classification!
    const decision = evaluateHandoff({
      classification: c,
      text: ctx.text,
      confidence: c.confidence,
      minConfidence: Math.min(ctx.settings.minConfidence, 0.35), // classification confidence gate is looser than reply confidence
      consecutiveBlockedRuns: ctx.memory.consecutiveBlockedRuns,
      leadScore: ctx.memory.lead?.score ?? 0,
      rules: ctx.settings.handoffRules,
      signals: c.signals,
    })
    if (decision.handoff) {
      ctx.handoffReason = decision.reason ?? decision.code ?? 'handoff'
      ctx.decisionReason = decision.code ?? 'handoff'
      ctx.confidence = 1
    }
    return decision.handoff
  }

  private async retrieve(ctx: AgentContext) {
    const { providers, db } = this.deps
    const search = new KnowledgeSearchService(db, providers.embedding)
    const productId =
      ctx.memory.lead?.interestProductId ?? ctx.memory.lead?.recommendedProductId ?? null
    const started = Date.now()
    const hits = await search.search({
      tenantId: ctx.input.tenantId,
      unitId: ctx.input.unitId,
      query: ctx.text,
      productId,
      limit: 6,
    })
    ctx.toolCalls.push({
      name: 'search_knowledge',
      input: { query: ctx.text, productId },
      output: hits.map((h) => ({ chunkId: h.chunkId, title: h.title, score: h.score })),
      ms: Date.now() - started,
    })
    ctx.knowledge = hits
    ctx.retrievalConfidence = KnowledgeSearchService.retrievalConfidence(hits)
  }

  private async tools(ctx: AgentContext) {
    const { db, providers } = this.deps
    const c = ctx.classification!
    const tools = new AgentTools({
      db,
      providers,
      ctx: agentContext(ctx.input.tenantId),
      unitId: ctx.input.unitId,
      contactId: ctx.memory.contact.id,
      leadId: ctx.memory.lead?.id ?? null,
      timezone: ctx.unit.timezone,
    })
    // Catalog is always loaded: it is cheap (DB) and required for grounding validation of any price/time mention.
    const catalog = await tools.getCatalog()
    ctx.toolCalls.push(catalog)
    ctx.catalog = catalog.output ?? []
    // SDR mode proposes the visit at every opportunity, so slots are always on hand (cheap: internal calendar / cached).
    const sdr = ctx.settings.salesMode === 'sdr'
    if (
      sdr ||
      c.needsCalendar ||
      c.intent === 'booking_request' ||
      ctx.memory.lead?.stageKey === 'scheduling' ||
      !!ctx.memory.upcomingAppointment
    ) {
      const slots = await tools.getAvailableSlots({ days: sdr ? 5 : 7 })
      ctx.toolCalls.push({ ...slots, output: slots.output?.map((s) => s.start.toISOString()) })
      ctx.slots = slots.output ?? []
    }
  }

  private buildSystemPrompt(
    ctx: AgentContext,
    promptContent: string,
    hints: string[] = [],
  ): string {
    const c = ctx.classification!
    const sdr = ctx.settings.salesMode === 'sdr'
    const modeHints = [
      sdr
        ? sdrModeRules(ctx.settings.visitLabel)
        : 'MODO CLOSER: você pode apresentar ofertas do <catalog> e conduzir até agendamento ou matrícula.',
      ctx.memory.upcomingAppointment
        ? `VISITA JÁ AGENDADA: ${formatInZone(ctx.memory.upcomingAppointment.startsAt, ctx.unit.timezone, "EEEE dd/MM 'às' HH:mm")} (iso: ${ctx.memory.upcomingAppointment.startsAt.toISOString()}). Se a pessoa quiser mudar o horário, ofereça opções da lista de horários disponíveis e use a ação reschedule_appointment com o iso exato do novo horário. Se quiser cancelar, use cancel_appointment e ofereça reagendar depois. Não crie uma segunda visita.`
        : '',
      `Intenção detectada: ${c.intent}${c.signals.length ? ` | sinais: ${c.signals.join(', ')}` : ''} | sentimento: ${c.sentiment}`,
      ctx.slots
        ? `Horários disponíveis (só ofereça estes; para agendar, use a ação book_appointment com o iso exato):\n${AgentTools.renderSlots(ctx.slots, ctx.unit.timezone)}`
        : '',
      ctx.memory.inboundCount <= 1
        ? 'Primeira mensagem da pessoa: acolha, responda e faça uma pergunta de descoberta leve.'
        : '',
      ...hints,
    ].filter(Boolean)
    return PromptRegistry.render(promptContent, {
      agent_name: ctx.settings.agentName,
      unit_name: ctx.unit.name,
      unit_city: ctx.unit.city ?? '',
      persona: ctx.settings.persona ?? '',
      tone: ctx.settings.tone ?? '',
      sales_brain: SalesBrainService.render(ctx.salesBrain),
      catalog_summary: ctx.catalog
        ? AgentTools.renderCatalog(ctx.catalog, { hidePricing: sdr })
        : '(catálogo indisponível — não cite valores)',
      lead_profile: renderLeadProfile(ctx.memory),
      facts: renderFacts([
        ...ctx.memory.facts,
        ...(ctx.extraction?.facts.map((f) => ({
          id: '',
          key: f.key,
          value: f.value,
          source: f.source,
          confidence: f.confidence,
        })) ?? []),
      ]),
      conversation_summary: ctx.memory.conversation.summary ?? '(conversa recente, sem resumo)',
      knowledge: ctx.knowledge.length
        ? KnowledgeSearchService.render(ctx.knowledge)
        : '(nenhum trecho relevante recuperado — não invente detalhes de metodologia/política)',
      stage: ctx.memory.lead
        ? `${ctx.memory.lead.stageName} (${ctx.memory.lead.stageKey})`
        : 'novo',
      now: formatInZone(new Date(), ctx.unit.timezone, 'EEEE, dd/MM/yyyy HH:mm'),
      max_chars: ctx.settings.maxReplyChars,
      max_questions: ctx.settings.maxQuestionsPerReply,
      mode_hints: modeHints.join('\n'),
    })
  }

  private async generate(ctx: AgentContext, feedback?: ValidationIssue[]) {
    const { providers } = this.deps
    const prompt = await this.prompt(ctx, 'conversation.system')
    const hints = feedback?.length
      ? [
          `ATENÇÃO: a resposta anterior foi rejeitada pela validação: ${feedback.map((i) => i.message).join('; ')}. Reescreva corrigindo esses pontos e sem citar valores/horários que não estejam no catálogo.`,
        ]
      : []
    const system = this.buildSystemPrompt(ctx, prompt.content, hints)
    const model =
      ctx.classification &&
      !COMMERCIAL_INTENTS.has(ctx.classification.intent) &&
      ctx.classification.intent !== 'unknown' &&
      ctx.classification.intent !== 'complaint'
        ? ctx.settings.models.classify
        : ctx.settings.models.generate
    const history = renderHistory(ctx.memory.recent.slice(-12), 3500)
    const user = `${wrapUntrusted('conversation_history', history)}\n\n${wrapUntrusted('customer_message', ctx.text)}\n\nResponda à última mensagem do cliente seguindo o formato JSON.`
    const res = await callJson(providers.llm, {
      model,
      task: 'generate',
      system,
      user,
      schema: GenerationSchema,
      schemaName: 'generation',
      maxTokens: 900,
      temperature: 0.5,
      metadata: { runId: ctx.runId, intent: ctx.classification?.intent ?? 'unknown' },
    })
    this.account(ctx, 'generate', res.response)
    ctx.model = res.response.model
    if (!res.data) {
      ctx.generation = {
        reply: SAFE_FALLBACK,
        actions: [
          {
            type: 'create_task',
            title: 'Responder manualmente: agente não conseguiu gerar resposta válida',
          },
        ],
        usedSources: [],
        confidence: 0.2,
      }
    } else {
      ctx.generation = res.data
    }
    ctx.confidence = ctx.generation.confidence
    ctx.finalReply = ctx.generation.reply.trim()
    ctx.actions = [...ctx.generation.actions]
  }

  private async validate(ctx: AgentContext) {
    const g = runGuardrails({
      reply: ctx.finalReply ?? '',
      salesMode: ctx.settings.salesMode,
      catalog: ctx.catalog,
      knowledge: ctx.knowledge,
      slots: ctx.slots,
      memory: ctx.memory,
      maxChars: ctx.settings.maxReplyChars,
      maxQuestions: ctx.settings.maxQuestionsPerReply,
      timezone: ctx.unit.timezone,
    })
    ctx.validation = g
    if (g.ok) {
      if (g.rewrittenReply) ctx.finalReply = g.rewrittenReply
      // knowledge grounding: informational answers with no retrieval support lower confidence
      if (ctx.classification?.needsKnowledge && ctx.knowledge.length === 0)
        ctx.confidence = Math.min(ctx.confidence, 0.5)
      if (
        ctx.confidence < ctx.settings.minConfidence &&
        ctx.classification &&
        COMMERCIAL_INTENTS.has(ctx.classification.intent)
      ) {
        if (ctx.settings.handoffRules.onLowConfidence) {
          ctx.decision = 'handoff'
          ctx.decisionReason = 'low_confidence'
          ctx.handoffReason = `Baixa confiança na resposta (${ctx.confidence.toFixed(2)})`
          ctx.finalReply = HANDOFF_BRIDGE
        }
      }
      return
    }
    // Retry generation once with feedback, then re-validate
    const blocking = g.issues.filter((i) => i.severity === 'block')
    await this.generate(ctx, blocking)
    const second = runGuardrails({
      reply: ctx.finalReply ?? '',
      salesMode: ctx.settings.salesMode,
      catalog: ctx.catalog,
      knowledge: ctx.knowledge,
      slots: ctx.slots,
      memory: ctx.memory,
      maxChars: ctx.settings.maxReplyChars,
      maxQuestions: ctx.settings.maxQuestionsPerReply,
      timezone: ctx.unit.timezone,
    })
    ctx.validation = {
      ok: second.ok,
      issues: [...g.issues, ...second.issues.map((i) => ({ ...i, code: `retry:${i.code}` }))],
      rewrittenReply: second.rewrittenReply,
    }
    if (second.ok) {
      if (second.rewrittenReply) ctx.finalReply = second.rewrittenReply
      return
    }
    ctx.decision = 'blocked'
    ctx.decisionReason = second.issues
      .filter((i) => i.severity === 'block')
      .map((i) => i.code)
      .join(',')
    ctx.confidence = 0
    ctx.actions = ctx.actions.filter((a) => a.type !== 'book_appointment')
    if (
      ctx.settings.handoffRules.onRepeatedFailures > 0 &&
      ctx.memory.consecutiveBlockedRuns + 1 >= ctx.settings.handoffRules.onRepeatedFailures
    ) {
      ctx.decision = 'handoff'
      ctx.handoffReason = 'Respostas bloqueadas repetidamente pela validação'
      ctx.finalReply = HANDOFF_BRIDGE
    } else {
      ctx.finalReply = SAFE_FALLBACK
      ctx.actions.push({
        type: 'create_task',
        title: `Verificar resposta bloqueada: ${ctx.decisionReason}`,
      })
    }
  }

  private needsLlmVerify(ctx: AgentContext): boolean {
    if (ctx.decision !== 'reply' || !ctx.classification) return false
    const intent = ctx.classification.intent
    return (
      ['price_request', 'objection', 'buying_signal', 'b2b_inquiry'].includes(intent) &&
      (ctx.settings.extraLlmVerify ?? false)
    )
  }

  private async llmVerify(ctx: AgentContext) {
    const { providers } = this.deps
    const prompt = await this.prompt(ctx, 'validate.reply')
    const user = PromptRegistry.render(prompt.content, {
      reply: ctx.finalReply ?? '',
      catalog_summary: ctx.catalog
        ? AgentTools.renderCatalog(ctx.catalog, { hidePricing: ctx.settings.salesMode === 'sdr' })
        : '',
      knowledge: KnowledgeSearchService.render(ctx.knowledge),
      facts: renderFacts(ctx.memory.facts),
      recent_history: renderHistory(ctx.memory.recent.slice(-8), 2500),
      policies: ctx.salesBrain.commercialRules.concat(ctx.salesBrain.forbidden).join('; '),
    })
    const res = await callJson(providers.llm, {
      model: ctx.settings.models.validate,
      task: 'validate',
      user,
      schema: ValidationResultSchema,
      schemaName: 'validation',
      maxTokens: 500,
      metadata: { runId: ctx.runId },
    })
    this.account(ctx, 'llm_verify', res.response)
    if (!res.data) return
    ctx.validation = {
      ok: ctx.validation?.ok !== false && res.data.ok,
      issues: [
        ...(ctx.validation?.issues ?? []),
        ...res.data.issues.map((i) => ({ ...i, code: `llm:${i.code}` })),
      ],
    }
    if (!res.data.ok) {
      ctx.decision = 'blocked'
      ctx.decisionReason = res.data.issues.map((i) => i.code).join(',')
      ctx.finalReply = SAFE_FALLBACK
      ctx.confidence = 0
    } else if (res.data.rewrittenReply && res.data.rewrittenReply.length > 10) {
      ctx.finalReply = res.data.rewrittenReply
    }
  }

  /** Applies model-proposed actions that need deterministic validation before persistence. */
  private async applyActions(ctx: AgentContext) {
    const { db, providers } = this.deps
    const kept: AgentAction[] = []
    for (const action of ctx.actions) {
      if (action.type === 'book_appointment') {
        const slot = ctx.slots?.find(
          (s) =>
            s.start.toISOString() === action.isoStart ||
            Math.abs(s.start.getTime() - new Date(action.isoStart).getTime()) < 60_000,
        )
        if (!slot) {
          ctx.validation = {
            ok: ctx.validation?.ok ?? true,
            issues: [
              ...(ctx.validation?.issues ?? []),
              {
                code: 'invalid_slot',
                severity: 'warn',
                message: `Slot ${action.isoStart} não estava na lista de disponibilidade; agendamento ignorado`,
              },
            ],
          }
          continue
        }
        if (ctx.input.dryRun) {
          kept.push(action)
          continue
        }
        const tools = new AgentTools({
          db,
          providers,
          ctx: agentContext(ctx.input.tenantId),
          unitId: ctx.input.unitId,
          contactId: ctx.memory.contact.id,
          leadId: ctx.memory.lead?.id ?? null,
          timezone: ctx.unit.timezone,
        })
        const res = await tools.createAppointment({
          isoStart: slot.start.toISOString(),
          kind: action.kind,
        })
        ctx.toolCalls.push({
          ...res,
          output: res.output
            ? { id: (res.output as { id: string }).id, startsAt: slot.start.toISOString() }
            : null,
        })
        if (res.error) {
          ctx.finalReply =
            `${ctx.finalReply}\n\n(Não consegui confirmar o horário automaticamente; um consultor vai confirmar com você.)`.trim()
          ctx.actions.push({
            type: 'create_task',
            title: `Confirmar agendamento manualmente: ${slot.start.toISOString()}`,
          })
          continue
        }
        kept.push(action)
        ctx.stageSuggestion = 'scheduling'
        continue
      }
      if (action.type === 'reschedule_appointment' || action.type === 'cancel_appointment') {
        const upcoming = ctx.memory.upcomingAppointment
        if (!upcoming) {
          ctx.validation = {
            ok: ctx.validation?.ok ?? true,
            issues: [
              ...(ctx.validation?.issues ?? []),
              {
                code: 'no_upcoming_appointment',
                severity: 'warn',
                message: `Ação ${action.type} sem visita agendada; ignorada`,
              },
            ],
          }
          continue
        }
        if (ctx.input.dryRun) {
          kept.push(action)
          continue
        }
        const appointments = new AppointmentService(db, providers.calendar)
        const tctx = agentContext(ctx.input.tenantId)
        const started = Date.now()
        if (action.type === 'cancel_appointment') {
          try {
            await appointments.setStatus(tctx, upcoming.id, 'cancelled')
            ctx.toolCalls.push({
              name: 'cancel_appointment',
              input: { appointmentId: upcoming.id, reason: action.reason ?? null },
              output: { ok: true },
              ms: Date.now() - started,
            })
            ctx.memory.appointmentsCount = Math.max(0, ctx.memory.appointmentsCount - 1)
            ctx.memory.upcomingAppointment = null
            kept.push(action)
          } catch (err) {
            ctx.toolCalls.push({
              name: 'cancel_appointment',
              input: { appointmentId: upcoming.id },
              output: null,
              ms: Date.now() - started,
              error: (err as Error).message,
            })
            ctx.actions.push({
              type: 'create_task',
              title: `Cancelar visita manualmente (${upcoming.startsAt.toISOString()})`,
            })
          }
          continue
        }
        const slot = ctx.slots?.find(
          (s) =>
            s.start.toISOString() === action.isoStart ||
            Math.abs(s.start.getTime() - new Date(action.isoStart).getTime()) < 60_000,
        )
        if (!slot) {
          ctx.validation = {
            ok: ctx.validation?.ok ?? true,
            issues: [
              ...(ctx.validation?.issues ?? []),
              {
                code: 'invalid_slot',
                severity: 'warn',
                message: `Slot ${action.isoStart} não estava na lista de disponibilidade; remarcação ignorada`,
              },
            ],
          }
          continue
        }
        try {
          await appointments.reschedule(tctx, upcoming.id, slot.start)
          ctx.toolCalls.push({
            name: 'reschedule_appointment',
            input: { appointmentId: upcoming.id, isoStart: slot.start.toISOString() },
            output: { ok: true },
            ms: Date.now() - started,
          })
          ctx.memory.upcomingAppointment = {
            ...upcoming,
            startsAt: slot.start,
            endsAt: new Date(
              slot.start.getTime() + (upcoming.endsAt.getTime() - upcoming.startsAt.getTime()),
            ),
          }
          kept.push(action)
          ctx.stageSuggestion = 'scheduling'
        } catch (err) {
          ctx.toolCalls.push({
            name: 'reschedule_appointment',
            input: { appointmentId: upcoming.id, isoStart: slot.start.toISOString() },
            output: null,
            ms: Date.now() - started,
            error: (err as Error).message,
          })
          ctx.finalReply =
            `${ctx.finalReply}\n\n(Não consegui remarcar automaticamente; um consultor vai confirmar o novo horário com você.)`.trim()
          ctx.actions.push({
            type: 'create_task',
            title: `Remarcar visita manualmente para ${slot.start.toISOString()}`,
          })
        }
        continue
      }
      if (action.type === 'handoff') {
        ctx.decision = 'handoff'
        ctx.handoffReason = action.reason
        ctx.decisionReason = 'agent_requested_handoff'
      }
      kept.push(action)
    }
    ctx.actions = kept
  }

  private async send(ctx: AgentContext): Promise<string | null> {
    if (!ctx.finalReply || ctx.decision === 'silent') return null
    const { db, providers } = this.deps
    const m = ctx.memory
    if (
      !isSessionWindowOpen(m.conversation.channelKind, m.conversation.lastInboundAt ?? new Date())
    ) {
      ctx.decision = 'template_required'
      ctx.decisionReason = 'session_window_closed'
      return null
    }
    const tctx = agentContext(ctx.input.tenantId)
    const conversations = new ConversationService(db)
    const { message } = await db.$transaction((tx) =>
      conversations.appendMessage(tx, tctx, ctx.input.conversationId, {
        direction: 'outbound',
        type: 'text',
        authorType: 'agent',
        text: ctx.finalReply,
        status: 'queued',
        agentRunId: ctx.runId,
      }),
    )
    const identity = await db.contactIdentity.findFirst({
      where: { contactId: m.contact.id, channel: m.conversation.channelKind },
    })
    const channel = await db.channel.findUnique({ where: { id: m.conversation.channelId } })
    const messaging =
      channel && providers.messagingFor
        ? providers.messagingFor({
            provider: channel.provider,
            externalId: channel.externalId,
            config: channel.config,
          })
        : providers.messaging
    try {
      const to = identity?.externalId ?? (m.contact.phone ?? '').replace(/^\+/, '')
      const sent = await messaging.sendText({ to, text: ctx.finalReply })
      await db.message.update({
        where: { id: message.id },
        data: { status: 'sent', sentAt: new Date(), providerMessageId: sent.providerMessageId },
      })
    } catch (err) {
      await db.message.update({
        where: { id: message.id },
        data: { status: 'failed', errorTitle: (err as Error).message },
      })
      this.deps.logger.error({ err, messageId: message.id }, 'outbound send failed')
    }
    return message.id
  }

  private async updateCrm(ctx: AgentContext) {
    const { db } = this.deps
    const tctx = agentContext(ctx.input.tenantId)
    const m = ctx.memory
    if (!m.lead) return null
    const leadId = m.lead.id
    const c = ctx.classification
    const isDry = ctx.input.dryRun === true

    return db.$transaction(async (tx) => {
      // 1. Facts
      const newFacts = (ctx.extraction?.facts ?? []).map((f) => ({
        key: f.key,
        value: f.value,
        source: f.source,
        confidence: f.confidence,
        evidenceMessageId: ctx.input.inboundMessageId ?? null,
      }))
      if (ctx.extraction?.invalidatedKeys.length) {
        await tx.leadFact.updateMany({
          where: { leadId, key: { in: ctx.extraction.invalidatedKeys }, status: 'active' },
          data: { status: 'stale' },
        })
      }
      if (newFacts.length && !isDry) await LeadService.upsertFactsTx(tx, tctx, leadId, newFacts)
      const facts = isDry
        ? [...m.facts, ...newFacts.map((f) => ({ ...f, id: '' }))]
        : await tx.leadFact.findMany({ where: { leadId, status: 'active' } })

      // Contact enrichment from facts
      const nameFact = newFacts.find((f) => f.key === 'name')?.value
      const emailFact = newFacts.find((f) => f.key === 'email')?.value
      const cityFact = newFacts.find((f) => f.key === 'city')?.value
      const companyFact = newFacts.find((f) => f.key === 'company')?.value
      const profileFact =
        newFacts.find((f) => f.key === 'profile_type')?.value ??
        (c?.profileType !== 'unknown' ? c?.profileType : undefined)
      if (!isDry && (nameFact || emailFact || cityFact || profileFact || companyFact)) {
        let companyId: string | undefined
        if (companyFact) {
          const company = await tx.company.create({
            data: { tenantId: ctx.input.tenantId, name: companyFact },
          })
          companyId = company.id
        }
        await tx.contact.update({
          where: { id: m.contact.id },
          data: {
            ...(nameFact && !m.contact.name
              ? { name: nameFact, firstName: nameFact.split(' ')[0] }
              : {}),
            ...(emailFact ? { email: emailFact } : {}),
            ...(cityFact ? { city: cityFact } : {}),
            ...(profileFact ? { profileType: profileFact } : {}),
            ...(companyId ? { companyId } : {}),
            lastSeenAt: new Date(),
          },
        })
        if (profileFact)
          await tx.lead.update({ where: { id: leadId }, data: { profileType: profileFact } })
      }

      // 2. Product recommendation
      const catalog = ctx.catalog ?? []
      let recommendedProductId: string | null = null
      const recAction = ctx.actions.find(
        (a): a is Extract<AgentAction, { type: 'recommend_product' }> =>
          a.type === 'recommend_product',
      )
      const mentioned = c?.mentionsProducts ?? []
      const interestSlug =
        recAction?.productSlug ??
        facts.find((f) => f.key === 'interest_product')?.value ??
        mentioned[0]
      if (interestSlug) {
        const p = catalog.find(
          (x) => x.slug === interestSlug || x.name.toLowerCase() === interestSlug.toLowerCase(),
        )
        if (p) recommendedProductId = p.id
      }
      if (!recommendedProductId) {
        for (const sig of c?.signals ?? []) {
          const def = ctx.salesBrain.signals.find((s) => s.key === sig)
          const slug = def?.recommendedProducts[0]
          const p = slug ? catalog.find((x) => x.slug === slug) : undefined
          if (p) {
            recommendedProductId = p.id
            break
          }
        }
      }

      // 3. Score
      const lower = ctx.text.toLowerCase()
      const scoringConfig = await tx.scoringConfig.findFirst({
        where: { unitId: ctx.input.unitId, isActive: true },
      })
      const askedPrice =
        c?.intent === 'price_request' || /\b(pre[cç]o|valor|quanto custa)/.test(lower)
      const askedSchedule = c?.intent === 'schedule_request' || /\b(hor[aá]rio|turma)/.test(lower)
      const previousSignals = await tx.agentRun.findMany({
        where: { conversationId: ctx.input.conversationId, kind: 'reply', status: 'completed' },
        select: { classification: true },
        take: 30,
      })
      const pastIntents = new Set(
        previousSignals
          .map((r) => (r.classification as Classification | null)?.intent)
          .filter(Boolean),
      )
      const score = computeLeadScore(
        {
          facts: facts.map((f) => ({ key: f.key, value: f.value, source: f.source })),
          classification: c,
          inboundMessages: m.inboundCount,
          outboundMessages: m.outboundCount,
          lastInboundAt: new Date(),
          askedPrice: askedPrice || pastIntents.has('price_request'),
          askedSchedule: askedSchedule || pastIntents.has('schedule_request'),
          requestedBooking:
            c?.intent === 'booking_request' ||
            pastIntents.has('booking_request') ||
            ctx.actions.some((a) => a.type === 'book_appointment'),
          requestedEnrollment: c?.intent === 'buying_signal' || pastIntents.has('buying_signal'),
          isB2B:
            c?.profileType === 'b2b' ||
            facts.some((f) => f.key === 'profile_type' && f.value === 'b2b'),
          productMatched: !!recommendedProductId || !!m.lead!.interestProductId,
          appointmentsCount:
            m.appointmentsCount + (ctx.actions.some((a) => a.type === 'book_appointment') ? 1 : 0),
          optedOut: m.optedOut || c?.intent === 'opt_out',
        },
        {
          ...DEFAULT_SCORING_WEIGHTS,
          ...((scoringConfig?.weights as Record<string, number> | null) ?? {}),
        },
      )

      // 4. Stage (forward-only, respects autoStageTransitions)
      let stageKey = m.lead!.stageKey
      const setStage = ctx.actions.find(
        (a): a is Extract<AgentAction, { type: 'set_stage' }> => a.type === 'set_stage',
      )
      // A confirmed booking always lands the lead in "scheduling", whatever the model suggested.
      let target = ctx.actions.some((a) => a.type === 'book_appointment')
        ? 'scheduling'
        : (setStage?.stage ?? ctx.stageSuggestion)
      if (
        score.score >= 50 &&
        ['new', 'conversing', 'discovery'].includes(target ?? stageKey) &&
        facts.some((f) => f.key === 'pain' || f.key === 'goal')
      )
        target = 'qualified'
      if (target && !isDry && ctx.settings.autoStageTransitions && ctx.decision !== 'silent') {
        const moved = await LeadService.advanceStageTx(
          tx,
          tctx,
          leadId,
          target,
          `agent:${c?.intent ?? 'n/a'}`,
        )
        if (moved) stageKey = moved.stage.key
      } else if (target && !ctx.settings.autoStageTransitions) {
        ctx.actions.push({
          type: 'set_stage',
          stage: target,
          reason: 'suggested (auto transitions disabled)',
        })
      }

      // 5. Next best action / follow-up
      const dncAction = ctx.actions.find(
        (a): a is Extract<AgentAction, { type: 'do_not_contact_until' }> =>
          a.type === 'do_not_contact_until',
      )
      const dncFact = newFacts.find((f) => f.key === 'do_not_contact_until')?.value
      const dnc = dncAction?.isoDate ?? dncFact
      const doNotContactUntil = dnc ? new Date(dnc) : null
      const followAction = ctx.actions.find(
        (a): a is Extract<AgentAction, { type: 'schedule_followup' }> =>
          a.type === 'schedule_followup',
      )
      const policy = await loadFollowUpPolicy(tx, ctx.input.unitId)
      const attempts = await tx.followUp.count({ where: { leadId, status: 'sent' } })
      const plan = planFollowUp({
        classification: c,
        stageKey,
        facts: facts.map((f) => ({ key: f.key, value: f.value })),
        agentRequested: followAction
          ? { hours: followAction.hours, reason: followAction.reason }
          : null,
        doNotContactUntil,
        optedOut: m.optedOut || c?.intent === 'opt_out',
        lastInboundAt: new Date(),
        hasScheduledAppointment:
          m.appointmentsCount > 0 ||
          ctx.actions.some(
            (a) => a.type === 'book_appointment' || a.type === 'reschedule_appointment',
          ),
        attemptsSoFar: attempts,
        policy,
      })
      let followUpAt: Date | null = null
      if (!isDry) {
        await FollowUpService.cancelPendingTx(tx, leadId, 'customer_replied')
        if (
          plan.schedule &&
          plan.scheduledAt &&
          ctx.decision !== 'handoff' &&
          ctx.decision !== 'silent'
        ) {
          const fu = await FollowUpService.scheduleTx(tx, tctx, {
            leadId,
            conversationId: ctx.input.conversationId,
            unitId: ctx.input.unitId,
            timezone: ctx.unit.timezone,
            scheduledAt: plan.scheduledAt,
            reason: plan.reason,
            goal: plan.goal,
            scenario: plan.scenario,
            strategy: plan.strategy,
            policy,
          })
          followUpAt = fu?.scheduledAt ?? null
        } else if (plan.strategy === 'task_for_human') {
          await tx.task.create({
            data: {
              tenantId: ctx.input.tenantId,
              leadId,
              title: 'Follow-ups automáticos esgotados: decidir próximo passo',
              kind: 'call',
              priority: 'normal',
              createdBy: 'agent',
              assigneeId: m.lead!.ownerId,
            },
          })
        }
      } else {
        followUpAt = plan.schedule ? (plan.scheduledAt ?? null) : null
      }

      const nextBestAction =
        ctx.decision === 'handoff'
          ? `Assumir conversa: ${ctx.handoffReason}`
          : (ctx.generation?.nextBestAction ?? defaultNba(c, stageKey, plan.scenario))
      const recommendedOwnerId =
        ctx.decision === 'handoff' && !m.lead!.ownerId
          ? await pickOwner(tx, ctx.input.unitId, c?.profileType === 'b2b')
          : null

      // 6. Tasks from actions
      if (!isDry) {
        for (const a of ctx.actions) {
          if (a.type === 'create_task')
            await tx.task.create({
              data: {
                tenantId: ctx.input.tenantId,
                leadId,
                title: a.title,
                kind: a.kind ?? 'todo',
                priority: 'normal',
                createdBy: 'agent',
                assigneeId: m.lead!.ownerId ?? recommendedOwnerId,
              },
            })
        }
      }

      // 7. Persist lead summary fields + score snapshot
      if (!isDry) {
        await tx.lead.update({
          where: { id: leadId },
          data: {
            score: score.score,
            scoreBreakdown: score.factors as unknown as Prisma.InputJsonValue,
            nextBestAction,
            nextBestMessage: ctx.decision === 'reply' ? null : undefined,
            nextFollowupAt: followUpAt,
            nextFollowupReason: followUpAt ? plan.reason : null,
            doNotContactUntil: doNotContactUntil ?? undefined,
            recommendedProductId: recommendedProductId ?? undefined,
            interestProductId:
              !m.lead!.interestProductId && recommendedProductId && (recAction || interestSlug)
                ? recommendedProductId
                : undefined,
            recommendedOwnerId: recommendedOwnerId ?? undefined,
            urgency: c?.urgency && c.urgency !== 'low' ? c.urgency : undefined,
            mainPain: facts.find((f) => f.key === 'pain')?.value ?? undefined,
            goal: facts.find((f) => f.key === 'goal')?.value ?? undefined,
            lastInteractionAt: new Date(),
          },
        })
        const lastSnapshot = await tx.leadScoreSnapshot.findFirst({
          where: { leadId },
          orderBy: { createdAt: 'desc' },
        })
        if (!lastSnapshot || lastSnapshot.score !== score.score) {
          await tx.leadScoreSnapshot.create({
            data: {
              leadId,
              score: score.score,
              factors: score.factors as unknown as Prisma.InputJsonValue,
            },
          })
          await emitEvent(tx, {
            type: 'lead.scored',
            tenantId: ctx.input.tenantId,
            unitId: ctx.input.unitId,
            aggregateType: 'lead',
            aggregateId: leadId,
            payload: {
              score: score.score,
              previous: lastSnapshot?.score ?? null,
              topReasons: score.topReasons,
              contactId: m.contact.id,
            },
            actor: 'agent',
          })
        }
        if (c)
          await tx.conversation.update({
            where: { id: ctx.input.conversationId },
            data: { sentiment: c.sentiment },
          })

        // 8. Handoff side effects
        if (ctx.decision === 'handoff') {
          const summary = {
            reason: ctx.handoffReason,
            intent: c?.intent,
            pain: facts.find((f) => f.key === 'pain')?.value ?? null,
            goal: facts.find((f) => f.key === 'goal')?.value ?? null,
            objections: facts.filter((f) => f.key === 'objection').map((f) => f.value),
            interestProduct:
              catalog.find((p) => p.id === (recommendedProductId ?? m.lead!.interestProductId))
                ?.name ?? null,
            urgency: c?.urgency ?? null,
            score: score.score,
            facts: facts.map((f) => ({ key: f.key, value: f.value })),
            recommendedNextStep: nextBestAction,
            summary: m.conversation.summary,
          }
          await tx.conversation.update({
            where: { id: ctx.input.conversationId },
            data: {
              mode: 'human',
              handoffReason: ctx.handoffReason,
              handoffAt: new Date(),
              handoffSummary: summary as Prisma.InputJsonValue,
              assigneeId: m.lead!.ownerId ?? recommendedOwnerId,
            },
          })
          if (recommendedOwnerId && !m.lead!.ownerId)
            await tx.lead.update({ where: { id: leadId }, data: { ownerId: recommendedOwnerId } })
          await emitEvent(tx, {
            type: 'handoff.requested',
            tenantId: ctx.input.tenantId,
            unitId: ctx.input.unitId,
            aggregateType: 'conversation',
            aggregateId: ctx.input.conversationId,
            payload: {
              reason: ctx.handoffReason,
              code: ctx.decisionReason,
              leadId,
              contactId: m.contact.id,
              assigneeId: m.lead!.ownerId ?? recommendedOwnerId,
              summary,
            },
            actor: 'agent',
          })
          await tx.task.create({
            data: {
              tenantId: ctx.input.tenantId,
              leadId,
              title: `Assumir conversa (${ctx.handoffReason})`,
              kind: 'message',
              priority: 'high',
              createdBy: 'agent',
              assigneeId: m.lead!.ownerId ?? recommendedOwnerId,
              dueAt: new Date(Date.now() + 15 * 60000),
            },
          })
        }
      }

      return {
        score: score.score,
        scoreReasons: score.topReasons,
        stage: stageKey,
        nextBestAction,
        followUpAt,
      }
    })
  }

  private async maybeSummarize(ctx: AgentContext) {
    const summarizer = new ConversationSummarizer(
      this.deps.db,
      this.deps.providers.llm,
      this.deps.prompts,
    )
    const res = await summarizer.maybeUpdate(
      ctx.input.tenantId,
      ctx.input.conversationId,
      ctx.settings.models.summarize,
    )
    if (res.updated) ctx.usage.costUsd += res.costUsd
  }
}

/** Injected into the system prompt via mode_hints, so it applies to every prompt version, including already-seeded ones. */
export function sdrModeRules(visitLabel: string): string {
  return [
    '## MODO SDR (obrigatório)',
    `Seu único objetivo comercial é agendar uma ${visitLabel}. Você NÃO vende, NÃO apresenta planos ou produtos em detalhe e NÃO fala de preço, parcela, desconto, duração de contrato ou condições comerciais, mesmo que a pessoa insista ou que esses dados apareçam no contexto.`,
    '- Se perguntarem preço, valor ou parcelamento: acolha em uma frase (faz sentido querer saber), explique que os valores e o formato ideal são apresentados na visita, depois de um diagnóstico rápido para indicar exatamente o programa certo, e convide para a visita oferecendo 2 horários concretos da lista de horários disponíveis. Sem pedir desculpas em excesso e sem enrolar.',
    '- Faça descoberta (dor, objetivo, contexto) só o suficiente para gerar valor e personalizar o convite; o diagnóstico completo acontece na visita.',
    '- Ao confirmar um horário, use a ação book_appointment e depois só confirme os detalhes práticos (endereço, duração, o que esperar). Não retome a venda depois de agendar.',
    '- Se a pessoa recusar a visita mais de uma vez ou exigir preço por mensagem, ofereça conversar com um consultor humano (ação handoff com reason "insiste em preço por mensagem").',
    '- Não use a ação recommend_product na resposta ao cliente; o programa é definido na visita.',
  ].join('\n')
}

function defaultNba(c: Classification | null, stage: string, scenario?: string): string {
  if (!c) return 'Acompanhar conversa'
  switch (c.intent) {
    case 'price_request':
      return 'Reforçar valor e convidar para visita/aula experimental'
    case 'booking_request':
    case 'schedule_request':
      return 'Confirmar horário e enviar orientações da visita'
    case 'buying_signal':
      return 'Ligar agora para fechar matrícula'
    case 'objection':
      return 'Enviar depoimento/prova relacionada à objeção'
    case 'b2b_inquiry':
      return 'Transferir para especialista B2B e agendar reunião'
    default:
      return stage === 'qualified'
        ? 'Apresentar produto recomendado e propor visita'
        : scenario
          ? `Aguardar follow-up (${scenario})`
          : 'Continuar descoberta'
  }
}

async function pickOwner(tx: DbTx, unitId: string, preferManager: boolean): Promise<string | null> {
  const user = await tx.user.findFirst({
    where: {
      status: 'active',
      role: { in: preferManager ? ['manager', 'admin', 'owner'] : ['seller', 'manager'] },
      units: { some: { unitId } },
    },
    orderBy: { lastLoginAt: 'desc' },
    select: { id: true },
  })
  return user?.id ?? null
}

function summarizeForTrace(v: unknown): unknown {
  if (v === undefined || v === null) return v
  if (typeof v === 'string') return v.length > 500 ? `${v.slice(0, 500)}…` : v
  if (typeof v === 'object') {
    try {
      const s = JSON.stringify(v)
      return s.length > 2000 ? `${s.slice(0, 2000)}…` : v
    } catch {
      return '[unserializable]'
    }
  }
  return v
}

export { ProductService as _ProductServiceRef }
