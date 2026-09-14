import 'dotenv/config'
import { createDb } from '@vox/db'
import { createLogger, InboundProcessor, NoopRealtimePublisher, PromptRegistry } from '@vox/core'
import { createProvidersFromEnv, MockMessagingProvider } from '@vox/providers'

/**
 * CLI: simulate an inbound WhatsApp message end-to-end without the API/worker.
 *   pnpm simulate --phone 5565999990001 --name "Ana" --text "quanto custa o academy?"
 */
async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1] ?? 'true'] : [])).filter((p) => p.length))
  const phone = (args['phone'] ?? '5565999990001').replace(/\D/g, '')
  const text = args['text'] ?? 'Oi, queria saber como funciona o curso'
  const logger = createLogger('simulate', 'warn')
  const db = createDb()
  const { providers, status } = createProvidersFromEnv(process.env as Record<string, string | undefined>, logger)
  const channel = await db.channel.findFirst({ where: { kind: 'whatsapp' }, orderBy: { createdAt: 'asc' } })
  if (!channel) throw new Error('No WhatsApp channel found. Run the seed first.')
  const mock = new MockMessagingProvider()
  const [event] = mock.parseInbound(MockMessagingProvider.inboundTextPayload({ phoneNumberId: channel.externalId, from: phone, name: args['name'], text }))
  const processor = new InboundProcessor({ db, providers, logger, prompts: new PromptRegistry(db) }, new NoopRealtimePublisher())
  const started = Date.now()
  const result = await processor.process(event!)
  const run = result.run
  console.log('\n─── SIMULAÇÃO ───────────────────────────────')
  console.log(`providers: llm=${status.llm} embedding=${status.embedding} messaging=${status.messaging}`)
  console.log(`cliente (${phone}): ${text}`)
  console.log(`agente: ${run?.reply ?? '(sem resposta)'}`)
  console.log(`decisão: ${run?.decision} ${run?.decisionReason ?? ''}`)
  console.log(`intenção: ${run?.classification?.intent} | sinais: ${run?.classification?.signals.join(',') || '-'}`)
  console.log(`fatos: ${run?.extraction?.facts.map((f) => `${f.key}=${f.value}`).join('; ') || '-'}`)
  console.log(`score: ${run?.score} | estágio: ${run?.stage} | NBA: ${run?.nextBestAction}`)
  console.log(`fontes: ${run?.knowledge.map((k) => k.title).join(', ') || '-'} (confiança retrieval ${run?.retrievalConfidence})`)
  console.log(`validação: ${run?.validation?.ok ? 'ok' : 'bloqueada'} ${run?.validation?.issues.map((i) => i.code).join(',') ?? ''}`)
  console.log(`custo: $${run?.usage.costUsd.toFixed(5)} | tokens ${run?.usage.inputTokens}/${run?.usage.outputTokens} | ${Date.now() - started}ms`)
  console.log(`conversationId: ${result.conversationId}`)
  await db.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
