import { z } from 'zod'
import type { PromptKey } from '@vox/shared'
import { callJson } from '../agent/llm-json.js'
import type { AgentDeps } from '../agent/types.js'
import { loadAgentSettings } from '../settings/agent-settings.js'
import type { TenantContext } from '../tenant/context.js'
import { ValidationError } from '../errors.js'
import { PromptAdminService } from './registry.js'

const Output = z.object({
  analysis: z.string(),
  changes: z.array(z.string()).max(12),
  revisedPrompt: z.string().min(50),
})

export interface ImprovementEvidence {
  blockedRuns: Array<{ issues: string[]; reply: string | null; at: Date }>
  negativeFeedback: Array<{
    reason: string | null
    comment: string | null
    reply: string | null
    at: Date
  }>
  lowEvaluations: Array<{ overall: number | null; comment: string | null; at: Date }>
  handoffs: Array<{ reason: string; at: Date }>
}

/**
 * Human-in-the-loop prompt improvement: gathers what went wrong recently (blocked replies, thumbs
 * down, low evaluations, handoff reasons), asks the model for a revised prompt and saves it as a
 * DRAFT version with the evidence in the notes. Nothing changes in production until a human
 * promotes the draft (Prompts → staging → production), ideally after a dataset run.
 */
export class PromptImprovementService {
  constructor(private readonly deps: AgentDeps) {}

  async collectEvidence(
    ctx: TenantContext,
    opts: { unitId?: string; days?: number } = {},
  ): Promise<ImprovementEvidence> {
    const { db } = this.deps
    const since = new Date(Date.now() - (opts.days ?? 14) * 864e5)
    const runWhere = {
      tenantId: ctx.tenantId,
      kind: 'reply',
      createdAt: { gte: since },
      ...(opts.unitId ? { unitId: opts.unitId } : {}),
    }
    const [blocked, feedback, evaluations, handoffs] = await Promise.all([
      db.agentRun.findMany({
        where: { ...runWhere, decision: 'blocked' },
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: { validation: true, replyText: true, createdAt: true },
      }),
      db.feedback.findMany({
        where: { rating: -1, createdAt: { gte: since }, message: { tenantId: ctx.tenantId } },
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: {
          reason: true,
          comment: true,
          createdAt: true,
          message: { select: { text: true } },
        },
      }),
      db.evaluation.findMany({
        where: { tenantId: ctx.tenantId, overall: { lt: 6 }, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { overall: true, comment: true, createdAt: true },
      }),
      db.agentRun.findMany({
        where: { ...runWhere, decision: 'handoff', decisionReason: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: { decisionReason: true, createdAt: true },
      }),
    ])
    return {
      blockedRuns: blocked.map((r) => ({
        issues: (
          (r.validation as { issues?: Array<{ code?: string; message?: string }> } | null)
            ?.issues ?? []
        )
          .map((i) => i.message ?? i.code ?? '')
          .filter(Boolean),
        reply: r.replyText,
        at: r.createdAt,
      })),
      negativeFeedback: feedback.map((f) => ({
        reason: f.reason,
        comment: f.comment,
        reply: f.message.text,
        at: f.createdAt,
      })),
      lowEvaluations: evaluations.map((e) => ({
        overall: e.overall,
        comment: e.comment,
        at: e.createdAt,
      })),
      handoffs: handoffs.map((h) => ({ reason: h.decisionReason!, at: h.createdAt })),
    }
  }

  async suggest(
    ctx: TenantContext,
    key: PromptKey,
    opts: { unitId?: string; days?: number; focus?: string } = {},
  ) {
    const { db, providers, prompts } = this.deps
    const current = await prompts.resolve(ctx.tenantId, key, 'production')
    const evidence = await this.collectEvidence(ctx, opts)
    const total =
      evidence.blockedRuns.length +
      evidence.negativeFeedback.length +
      evidence.lowEvaluations.length +
      evidence.handoffs.length
    if (!total && !opts.focus)
      throw new ValidationError(
        'Sem evidências recentes (respostas bloqueadas, avaliações negativas, handoffs). Informe um foco para a melhoria.',
      )

    const unit = opts.unitId
      ? await db.unit.findUnique({ where: { id: opts.unitId }, select: { id: true } })
      : await db.unit.findFirst({ where: { tenantId: ctx.tenantId }, select: { id: true } })
    const settings = unit ? await loadAgentSettings(db, unit.id, providers.models) : null
    const model = settings?.models.generate ?? providers.models.generate

    const user = [
      `Você revisa o prompt "${key}" de um agente SDR de WhatsApp da VOX2you (escola de oratória).`,
      'Objetivo: corrigir as falhas observadas SEM mudar o que já funciona, mantendo todas as variáveis {{...}} e as regras de segurança (nunca inventar preço, parcela, desconto, horário).',
      opts.focus ? `Foco pedido pelo gestor: ${opts.focus}` : '',
      '',
      '## Evidências recentes',
      evidence.blockedRuns.length
        ? `Respostas bloqueadas pela validação (${evidence.blockedRuns.length}):\n` +
          evidence.blockedRuns
            .slice(0, 8)
            .map((b) => `- ${b.issues.join('; ')} | resposta: ${(b.reply ?? '').slice(0, 200)}`)
            .join('\n')
        : '',
      evidence.negativeFeedback.length
        ? `Avaliações negativas dos consultores (${evidence.negativeFeedback.length}):\n` +
          evidence.negativeFeedback
            .slice(0, 8)
            .map(
              (f) =>
                `- ${f.reason ?? ''} ${f.comment ?? ''} | resposta: ${(f.reply ?? '').slice(0, 200)}`,
            )
            .join('\n')
        : '',
      evidence.lowEvaluations.length
        ? `Avaliações com nota baixa (${evidence.lowEvaluations.length}):\n` +
          evidence.lowEvaluations
            .slice(0, 6)
            .map((e) => `- nota ${e.overall}: ${e.comment ?? ''}`)
            .join('\n')
        : '',
      evidence.handoffs.length
        ? `Motivos de handoff (${evidence.handoffs.length}):\n` +
          evidence.handoffs
            .slice(0, 8)
            .map((h) => `- ${h.reason}`)
            .join('\n')
        : '',
      '',
      '## Prompt atual (produção)',
      '<<<PROMPT',
      current.content,
      'PROMPT>>>',
      '',
      'Responda em JSON: { "analysis": diagnóstico curto em pt-BR, "changes": lista objetiva do que mudou, "revisedPrompt": o prompt completo revisado }',
    ]
      .filter((l) => l !== '')
      .join('\n')

    const res = await callJson(providers.llm, {
      model,
      task: 'improve',
      user,
      schema: Output,
      schemaName: 'prompt_improvement',
      maxTokens: 4000,
      temperature: 0.3,
    })
    if (!res.data) throw new Error(`Sugestão inválida do modelo: ${res.parseError}`)
    const vars = [...current.content.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]!)
    const missing = vars.filter(
      (v) =>
        !res.data!.revisedPrompt.includes(`{{${v}}}`) &&
        !new RegExp(`\\{\\{\\s*${v}\\s*\\}\\}`).test(res.data!.revisedPrompt),
    )
    if (missing.length)
      throw new ValidationError(
        `A sugestão removeu variáveis obrigatórias: ${[...new Set(missing)].join(', ')}`,
      )

    const notes = [
      `Sugestão automática (${new Date().toISOString().slice(0, 10)}) a partir de ${total} evidência(s)${opts.focus ? ` · foco: ${opts.focus}` : ''}.`,
      `Diagnóstico: ${res.data.analysis}`,
      ...res.data.changes.map((c) => `• ${c}`),
      'Revise, teste no Playground (env=staging / dataset) e só então publique.',
    ].join('\n')
    const draft = await new PromptAdminService(db).createDraft(ctx, key, {
      content: res.data.revisedPrompt,
      notes,
    })
    return {
      draft,
      analysis: res.data.analysis,
      changes: res.data.changes,
      evidence: {
        blocked: evidence.blockedRuns.length,
        negativeFeedback: evidence.negativeFeedback.length,
        lowEvaluations: evidence.lowEvaluations.length,
        handoffs: evidence.handoffs.length,
      },
      baseVersion: current.version,
      usage: res.response.usage,
    }
  }
}
