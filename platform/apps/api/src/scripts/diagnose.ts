import 'dotenv/config'
import { createDb } from '@vox/db'
import { IntegrationService, createLogger, integrationKind } from '@vox/core'
import { createProvidersFromEnv } from '@vox/providers'

/**
 * Prints why the running server behaves the way it does: which providers each tenant actually gets,
 * which environment keys the CRM integrations contribute, and which credentials fail to decrypt.
 * Values are never printed — only names, lengths and booleans — so the output is safe to paste.
 */
async function main() {
  const logger = createLogger('diagnose', 'silent')
  const db = createDb()
  const env = process.env as Record<string, string | undefined>

  console.log('=== Ambiente do processo (nomes e presença, nunca valores) ===')
  for (const key of [
    'NODE_ENV',
    'LLM_PROVIDER',
    'EMBEDDING_PROVIDER',
    'STT_PROVIDER',
    'MESSAGING_PROVIDER',
    'CALENDAR_PROVIDER',
    'STORAGE_PROVIDER',
  ])
    console.log(`  ${key} = ${env[key] ?? '(não definido)'}`)
  for (const key of [
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'APP_ENCRYPTION_KEY',
    'WHATSAPP_ACCESS_TOKEN',
  ])
    console.log(`  ${key}: ${env[key] ? `definido (${env[key]!.length} caracteres)` : 'ausente'}`)

  const base = createProvidersFromEnv(env, logger)
  console.log('\n=== Provedores do processo (sem tenant) ===')
  console.log(' ', JSON.stringify(base.status))

  const key = env['APP_ENCRYPTION_KEY']
  if (!key) {
    console.log('\n✗ APP_ENCRYPTION_KEY ausente: nenhuma credencial do CRM pode ser lida.')
    await db.$disconnect()
    return
  }
  const integrations = new IntegrationService(db, key)
  const tenants = await db.tenant.findMany({ select: { id: true, name: true, slug: true } })

  for (const tenant of tenants) {
    console.log(`\n=== Conta ${tenant.name} (${tenant.slug}) ===`)
    const rows = await db.integration.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        kind: true,
        unitId: true,
        status: true,
        lastError: true,
        credentialsEnc: true,
        config: true,
        createdAt: true,
      },
    })
    if (!rows.length) console.log('  (nenhuma integração salva)')
    for (const row of rows) {
      const def = integrationKind(row.kind)
      let readable = '—'
      let envKeys = '—'
      try {
        const values = await integrations.values(tenant.id, row.kind, row.unitId)
        const fields = Object.keys(values?.values ?? {})
        readable = fields.length ? `ok (${fields.join(', ')})` : 'ok (sem campos)'
        envKeys = values
          ? Object.keys(def?.toEnv(values.values) ?? {}).join(', ') || '(nenhuma)'
          : '—'
      } catch (err) {
        readable = `FALHOU: ${(err as Error).message}`
      }
      console.log(
        `  - ${row.kind}${row.unitId ? ` [unidade ${row.unitId.slice(0, 8)}]` : ''} · status=${row.status}` +
          `${row.lastError ? ` · erro="${row.lastError}"` : ''}` +
          `\n      credenciais cifradas: ${row.credentialsEnc ? 'sim' : 'NÃO'} · decifrar: ${readable}` +
          `\n      variáveis que define: ${envKeys}`,
      )
    }
    try {
      const overrides = await integrations.envOverrides(tenant.id)
      const names = Object.keys(overrides)
      console.log(`  Overrides aplicados: ${names.length ? names.join(', ') : '(nenhum)'}`)
      const effective = createProvidersFromEnv({ ...env, ...overrides }, logger)
      console.log('  Provedores efetivos desta conta:', JSON.stringify(effective.status))
      if (effective.status.llm === 'mock')
        console.log(
          '  ⚠ O agente desta conta responde com o SIMULADOR (nenhuma chave de IA em uso).',
        )
    } catch (err) {
      console.log(`  ✗ envOverrides FALHOU: ${(err as Error).message}`)
      console.log('    → por isso o servidor continua com os provedores do .env (simulador).')
    }
  }
  await db.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
