# Segurança e LGPD

## 1. Modelo de ameaças (resumo)

| Ativo | Ameaça | Controle |
|---|---|---|
| Dados de leads (telefone, conversas, fatos) | Vazamento entre tenants/unidades | `TenantContext` obrigatório em todo repositório; filtros por `tenantId` em todas as queries; testes de isolamento; nunca usar `findUnique` só por id em rotas públicas |
| Webhook WhatsApp | Forjar mensagens inbound | Validação HMAC-SHA256 (`X-Hub-Signature-256`) sobre o corpo bruto; verify token no GET; rejeição se `WHATSAPP_APP_SECRET` ausente em produção |
| Webhook WhatsApp | Replay / duplicação | Idempotência por `providerMessageId` (unique) e `IdempotencyKey` no job |
| Painel / API | Credential stuffing, sessão roubada | scrypt (N=2^15) para senhas; JWT de acesso curto (15 min) + refresh token rotativo (httpOnly, `SameSite=Lax`) com revogação; rate limit por IP no login; lockout progressivo por conta em Redis (5 falhas → 1 min, dobrando até 30 min, limpo no login correto) |
| API | IDOR / escalação de privilégio | RBAC por rota (`requireRole`), autorização por recurso (`assertTenant`), scopes em API keys |
| Agente LLM | Prompt injection via mensagem/documento/URL | Conteúdo recuperado e mensagens do cliente entram **apenas** como dados delimitados (`<customer_message>`, `<knowledge>`), nunca como system; instruções explícitas de ignorar comandos dentro desses blocos; validação pós-geração; tools com Zod schema e allowlist; LLM não executa SQL/shell |
| Agente LLM | Alucinação de preço/horário/desconto | Valores só de `Offer`/`ClassSchedule`/`CalendarProvider`; validador detecta números monetários/horários na resposta sem fonte e bloqueia |
| Agente LLM | Ações financeiras indevidas | `PaymentProvider` só aceita `offerId`; valor calculado server-side; aprovação humana quando `requiresApproval` |
| Segredos | Vazamento em logs/traces | pino `redact` (`authorization`, `token`, `apiKey`, `password`, `phone`, `email`); TraceSink mascara PII configurável; `.env*` ignorado |
| Banco | SQL injection | Prisma parametrizado; SQL bruto via `Prisma.sql` template (parametrizado); nunca concatenar |
| Web | XSS / CSRF | React escapa por padrão; sem `dangerouslySetInnerHTML` com conteúdo de cliente; cookies `SameSite`; CSRF token para mutações via cookie; `helmet` na API; CORS restrito a `WEB_ORIGIN` |
| Upload de documentos | Arquivo malicioso, zip bomb | Limite de tamanho, allowlist de MIME, parsing em worker isolado, sem execução de macros |
| Infra | Perda de dados | Backups diários (`pg_dump`) + WAL; restore testado; ver `docs/DEPLOYMENT.md` |

## 2. Autenticação e autorização

- Usuários: e-mail + senha (scrypt, `packages/core/src/auth/password.ts`) — pronto para SSO (interface `AuthProvider`).
- E-mail é único **por tenant**, não globalmente. O login verifica a senha contra todos os usuários ativos com aquele e-mail e nunca deixa "o primeiro registro vencer"; se mais de um bater, exige `tenant` (slug) no corpo do login.
- Sessões: access JWT (HS256, `JWT_SECRET`, 15 min) + refresh (opaque, hash no banco, 30 dias, rotação a cada uso, família revogável).
- RBAC: `owner > admin > manager > seller > viewer`. Matriz em `packages/core/src/auth/permissions.ts`.
- API keys: `ApiKey(hash, scopes[], tenantId, unitIds[])` — header `X-Api-Key`.
- Toda requisição autenticada carrega `TenantContext { tenantId, unitIds, userId, role }`.

## 3. Isolamento multi-tenant

- `tenantId` em todas as tabelas de negócio; `unitId` onde aplicável.
- Repositórios de `core` recebem `TenantContext` e aplicam `where: { tenantId }` sempre.
- Conhecimento: `unitId IS NULL` = global no tenant; nunca cross-tenant.
- **Roteamento de entrada decide o tenant.** O webhook resolve o canal pelo `phone_number_id` da Meta, portanto esse id é único globalmente (`channels(kind, external_id)`), o seed recusa adotar um canal de outro tenant e o `InboundProcessor` recusa ids ambíguos em vez de escolher um tenant. Chamadores internos confiáveis (simulador) fixam `channelId` no evento.
- Testes: `tests/integration/channel-isolation.test.ts` (canal duplicado é rejeitado; evento vai para o tenant dono do canal) e `tests/integration/vertical-slice.test.ts` (fluxo completo dentro de um tenant). Pendente: teste dedicado provando que buscas, inbox, KB e catálogo não vazam entre dois tenants.

## 4. Prompt injection — política

1. System prompt vem apenas do `PromptRegistry` (versão de produção), nunca de dados do usuário.
2. Mensagens do cliente, transcrições, documentos e páginas web são **dados**, sempre envelopados em tags e com aviso ao modelo.
3. Ferramentas: allowlist por unidade; schemas Zod; autorização server-side; sem tools "genéricas" (nada de `run_sql`, `http_get` livre).
4. Validador pós-resposta bloqueia: links não autorizados, promessas de resultado garantido, condições não existentes, dados de outros contatos.
5. Documentos ingeridos passam por sanitização (remoção de instruções tipo "ignore previous instructions" é registrada como alerta, não silenciosa).

## 5. LGPD

| Requisito | Implementação |
|---|---|
| Consentimento e finalidade | `Consent(purpose, status, source, evidence)`; marketing só com `opted_in`; atendimento (service) por interesse legítimo/execução de contrato; registrado no primeiro contato |
| Opt-out | Detector + comando; bloqueia campanhas/follow-ups; evento `consent.revoked` |
| Retenção | `Tenant.retentionDays` (mensagens/mídia); job de expurgo/anonimização |
| Anonimização | `ContactService.anonymize(contactId)`: substitui identificadores por hash, remove mídia, mantém agregados |
| Exportação | `GET /api/v1/contacts/:id/export` (JSON) — direito de acesso/portabilidade |
| Exclusão | `DELETE /api/v1/contacts/:id` (soft → anonimização após período) com `AuditLog` |
| Auditabilidade | `AuditLog` para leitura de perfil completo, exportação, exclusão, mudanças de prompt/config |
| Minimização para providers | Antes de enviar a LLM/STT: redação opcional de CPF/cartão/e-mail via `PiiRedactor`; nunca enviar dados de outros contatos |
| Subprocessadores | Lista em `docs/INTEGRATIONS.md` |

## 6. Operação segura

- Segredos em variáveis de ambiente / secret manager; `APP_ENCRYPTION_KEY` (AES-256-GCM) para credenciais de `Integration`.
- Credenciais cadastradas pelo CRM (Configurações → Integrações): segredos só existem em claro na memória do processo; a API devolve apenas os 4 últimos caracteres; o audit log registra quais campos mudaram, nunca os valores; `settings:write` (owner/admin) é exigido para salvar, testar ou remover. Rotacionar `APP_ENCRYPTION_KEY` exige re-salvar as integrações.
- TLS obrigatório (terminação no proxy); HSTS via helmet.
- Health checks sem dados sensíveis.
- Graceful shutdown (drena filas e conexões).
- CI roda lint, typecheck, testes; dependabot recomendado.
- Rate limits: webhooks 600 req/min por IP (Meta pode rajar), API 300 req/min por usuário, login 10/min por IP.

## 7. Checklist antes de produção

- [ ] `WHATSAPP_APP_SECRET`, `JWT_SECRET`, `APP_ENCRYPTION_KEY` definidos (≥ 32 bytes aleatórios)
- [ ] `NODE_ENV=production` (desativa mocks e Swagger UI público)
- [ ] `WEB_ORIGIN` restrito
- [ ] Backups agendados e restore testado
- [ ] Langfuse self-hosted ou com mascaramento ativo
- [ ] Política de retenção configurada por tenant
