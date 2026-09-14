# VOX2you Conversational CRM — Arquitetura

> Documento vivo. Atualize sempre que uma decisão estrutural mudar.
> Última revisão: 2026-09-14.

## 1. Situação encontrada no repositório

Antes de qualquer alteração o repositório foi analisado. Ele contém **três coisas não relacionadas**:

| Item | O que é | Estado |
|---|---|---|
| Raiz (`app/`, `actions/`, `prisma/`, `lib/`) | `vox2you-estoque`: controle de estoque de material didático (Next.js 16, Supabase Auth, Prisma 7, deploy Vercel) | Em produção |
| `app/api/webhook/whatsapp` + `lib/whatsapp.ts` | Bot de grupo WhatsApp via **WAHA** (não-oficial) que interpreta mensagens de estoque com Claude | Em produção, estado em memória, sem dedup persistente, sem validação de assinatura |
| `forum-bess/`, `index.html`, `logo-*.png`, `app/forum` | Media kit estático do Fórum BESS 2026 | Estático |

### Riscos identificados

1. **Acoplamento e escopo**: o bot WAHA existente é um script de grupo (if/else + JSON do modelo) com estado em `Map` de processo. Não serve de base para o CRM e não deve ser reaproveitado. Ele continua funcionando de forma independente.
2. **Deploy Vercel do estoque**: qualquer reestruturação da raiz (mover para `apps/estoque`) exige alterar o *Root Directory* no projeto Vercel. Para não quebrar produção, **a nova plataforma vive em `platform/`** e a raiz não é tocada além de exclusões em `tsconfig`/`eslint`.
3. **WAHA ≠ WhatsApp Business Platform**: WAHA usa WhatsApp Web (risco de banimento, sem templates, sem status oficiais). A plataforma usa **Meta Cloud API** por padrão, via abstração `MessagingProvider`.
4. **Sem testes, sem CI, sem migrations versionadas** no projeto atual (`supabase-setup.sql` manual). A plataforma nasce com os três.
5. **Segredos**: `.env*` está no `.gitignore` (ok). Nenhum segredo foi encontrado versionado.

### Decisão: monorepo isolado em `platform/`

`platform/` é um monorepo npm-workspaces **autocontido** (próprio `package.json`, lockfile, tsconfig, CI, docker-compose). Pode ser extraído para um repositório próprio com `git subtree split -P platform` sem alterações. Quando o Vercel do estoque for reconfigurado, o estoque pode migrar para `platform/apps/estoque` — não é pré-requisito.

## 2. Visão geral

```
                    ┌────────────────────────────────────────────────────────────┐
  WhatsApp Cloud    │  apps/api (Fastify)                                        │
  Meta Webhooks ───▶│  /webhooks/*  verify + HMAC → normaliza → enfileira (≤50ms)│
                    │  /api/v1/*    REST versionada (OpenAPI), JWT + RBAC        │
  apps/web ────────▶│  /api/v1/stream  SSE (inbox em tempo real)                 │
  (Next.js 16)      └──────────────┬───────────────────────────┬─────────────────┘
                                   │ BullMQ (Redis)            │ Prisma (Postgres + pgvector)
                    ┌──────────────▼───────────────────────────▼─────────────────┐
                    │  apps/worker                                               │
                    │  inbound → AgentOrchestrator → outbound → CRM → outbox     │
                    │  ingestion (KB) · followups · automations · campaigns      │
                    └──────────────┬───────────────────────────────────────────┬─┘
                                   │ packages/core (domínio + agente + contratos)│
                                   │ packages/providers (adapters externos)      │
                                   └─────────────────────────────────────────────┘
```

### Pacotes

| Pacote | Responsabilidade | Depende de |
|---|---|---|
| `packages/shared` | Tipos, schemas Zod, utilidades puras (telefone E.164, ids, tempo/timezone, texto) | — |
| `packages/db` | Schema Prisma, migrations, client com adapter `pg`, seed, helpers SQL para pgvector/tsvector | shared |
| `packages/core` | Domínio (CRM, catálogo, conhecimento, follow-up, handoff, scoring, NBA), **contratos de providers** (`LLMProvider`, `EmbeddingProvider`, `MessagingProvider`, `SpeechToTextProvider`, `CalendarProvider`, `StorageProvider`, `TraceSink`, `PaymentProvider`, `ConversionProvider`), **AgentOrchestrator**, prompt registry, event bus/outbox | shared, db |
| `packages/providers` | Implementações: Anthropic, OpenAI (embeddings/STT), Meta Cloud API, Google Calendar, S3, Langfuse, SMTP + **mocks/sandbox determinísticos** para testes e playground | core |
| `apps/api` | HTTP: webhooks, REST, SSE, auth, OpenAPI | core, providers |
| `apps/worker` | Consumidores BullMQ, schedulers | core, providers |
| `apps/web` | UI: inbox, lead 360, kanban, admin, playground | shared (tipos) |

Regras de dependência (checadas por `eslint` `no-restricted-imports`):
- `core` **nunca** importa `providers` nem `apps`.
- `apps` **nunca** contêm lógica comercial; apenas orquestram serviços de `core`.
- `web` fala com `api` por HTTP; não acessa o banco.

## 3. Stack (versões validadas em 2026-09-14 via registry npm)

| Camada | Escolha | Versão | Justificativa |
|---|---|---|---|
| Linguagem | TypeScript | 5.9 | TS 7 (compilador Go) ainda não é padrão do ecossistema; 5.9 é o LTS de fato |
| Runtime | Node.js | 22 LTS | Disponível no ambiente; `fetch`/`WebStreams` nativos |
| API | Fastify | 5.x | Schema-first, OpenAPI nativo, ~3x throughput do Express; sem framework de agentes |
| Web | Next.js + React | 16.3 / 19.3 | Mesmo stack já usado pelo estoque; App Router; deploy simples |
| ORM | Prisma + `@prisma/adapter-pg` | 7.10 | Já usado no repo; migrations versionadas; SQL bruto onde Prisma não cobre (pgvector, tsvector) |
| Banco | PostgreSQL + pgvector | 16 / 0.8 | Um banco para relacional + full-text + vetores; sem lock-in de vector DB |
| Fila | BullMQ + Redis | 6 / 7 | Retry exponencial, DLQ, jobs agendados (follow-ups), rate limit por fila |
| Validação | Zod | 4 | Schemas compartilhados api↔web↔tools do agente |
| Logs | pino | 10 | Structured logging, redaction nativa |
| Testes | Vitest | 4 | Rápido, TS nativo |
| LLM | `@anthropic-ai/sdk` (primário) | 0.125 | Via `LLMProvider`; OpenAI/Gemini como adapters futuros |
| Embeddings | OpenAI `text-embedding-3-small` (1536d) | — | Anthropic não oferece embeddings; adapter trocável; mock determinístico para testes |
| Observabilidade IA | Langfuse | 3.x | Via `TraceSink`; `ConsoleTraceSink` sem credencial |
| Storage | S3-compatível (MinIO em dev) | — | Via `StorageProvider`; `LocalFsStorage` em dev/testes |

**Sem framework de agentes** (LangChain/LangGraph/etc.). O orquestrador é uma state machine própria, tipada, testável e observável. Motivo: controle de custo/latência por etapa, sem abstrações opacas, sem dependência de versão instável.

## 4. Pipeline do agente (AgentOrchestrator)

Implementado em `packages/core/src/agent/orchestrator.ts` como uma sequência de **etapas puras** com contrato `Step<Ctx>`; cada etapa decide se executa (custo) e registra span no `TraceSink`.

```
inbound message
  1. normalize        texto/áudio(STT)/mídia → texto canônico; detecta opt-out determinístico
  2. identify         contato por (tenant, canal, phone E.164); cria se não existir; lead + conversa
  3. memory           carrega: últimas N mensagens · resumo · LeadFacts estruturados · perfil
  4. gate             conversa em modo humano? → só registra + notifica; não responde
  5. classify         intent + sentimento + sinais comerciais (modelo rápido, JSON schema)
  6. extract          fatos novos (goal, pain, objection, product_interest, timeline...) com
                      proveniência (stated | inferred) e confiança
  7. stage            estágio comercial determinístico + sugestão de transição
  8. retrieve         se intent exige conhecimento: hybrid search (BM25 + vetor + filtros de
                      tenant/unit/product/vigência/prioridade) → contexto com source_ids
  9. tools            catálogo (preço/turmas), calendário (slots reais), handoff. Zod schemas,
                      autorização por tenant; LLM nunca executa SQL
 10. generate         modelo conversacional com prompt versionado (Sales Brain + persona +
                      políticas), memória e contexto; saída estruturada {reply, actions}
 11. validate         guardrails determinísticos + verificador LLM opcional:
                      grounding (preço/horário só de fontes), tamanho, repetição de pergunta,
                      pressão, políticas WhatsApp, janela 24h, confiança mínima
 12. send             enfileira outbound via MessagingProvider (idempotente)
 13. update CRM       facts, score (determinístico + comportamental + IA, com justificativa),
                      NBA, próximo follow-up, estágio, resumo
 14. emit             eventos de domínio no outbox (lead.qualified, stage.changed, ...)
```

Roteamento de custo: `classify` usa modelo rápido; `generate` usa modelo superior apenas quando `intent ∈ {sales, objection, scheduling, complex}`; perguntas simples (`faq`) com alta confiança de retrieval podem responder com modelo rápido. Seleção por tarefa está em `AgentSettings` (configurável por unidade).

## 5. Memória

- **Imediata**: últimas `N` mensagens (default 20) da conversa.
- **Resumida**: `Conversation.summary` regenerado a cada `K` mensagens ou ao fechar (modelo rápido).
- **Estruturada**: `LeadFact(key, value, source: stated|inferred|confirmed, status: active|stale, confidence, evidenceMessageId)`. Facts são a fonte para "não perguntar de novo".

## 6. Conhecimento (RAG)

- `KnowledgeDocument` (tenant, unit?, category, productId?, validFrom/validTo, priority, version, status, source) → `KnowledgeChunk` (content, `tsv` tsvector pt-BR, `embedding vector(1536)`, metadata).
- Busca híbrida: RRF (reciprocal rank fusion) entre BM25 (`ts_rank_cd`) e cosseno (`<=>`), filtrada por tenant + (unit OR global) + status=published + vigência; boost por `priority`; rerank opcional por LLM para top-k.
- Governança: só `published` e vigente entra na busca; nova versão publica sem restart (leitura é sempre do banco).
- Dados voláteis (preço, turma, desconto) **não** vêm do RAG: vêm do `ProductCatalogService` via tool. RAG responde "o que é", catálogo responde "quanto/quando".

## 7. Mensageria

`MessagingProvider` (`packages/core/src/providers/messaging.ts`):
`verifyWebhook`, `validateSignature`, `parseInbound` → `InboundEvent[]`, `sendText`, `sendTemplate`, `sendMedia`, `sendInteractive`, `markRead`, `downloadMedia`, `listTemplates`.

Adapter `MetaCloudApiProvider` (`packages/providers/src/messaging/meta-cloud`) implementa o contrato com Graph API v21+. `MockMessagingProvider` grava mensagens em memória e simula status para testes/playground. Janela de 24h é regra de domínio (`ConversationWindowPolicy`), não do adapter.

## 8. Eventos e automações

Padrão **outbox transacional**: serviços gravam `DomainEvent` na mesma transação; o worker publica na fila `events`; `AutomationEngine` avalia regras `(trigger, conditions) → actions`. Módulos não se chamam diretamente para efeitos colaterais.

## 9. Multi-tenancy

- Todas as entidades comerciais têm `tenantId`; a maioria também `unitId`.
- `TenantContext` obrigatório em todos os serviços (`{ tenantId, unitId?, userId?, role }`).
- Repositórios em `core` recebem `TenantContext` e injetam o filtro; testes de isolamento garantem que uma unidade nunca lê dados de outra.
- Conhecimento `unitId = null` é global ao tenant; nunca cross-tenant.

## 10. Observabilidade

- `TraceSink`: `startTrace/startSpan/end` com `conversationId, leadId, tenantId, messageId, promptVersion, model, tokens, cost, latency, retrieval, tools, confidence`.
- `AgentRun` + `ToolCall` persistidos no banco para auditoria via UI (independente do Langfuse).
- Logs pino com redaction de `phone`, `email`, `authorization`, `token`.
- `/health` (liveness) e `/ready` (db + redis).

## 11. Estrutura de diretórios

```
platform/
  package.json · tsconfig.base.json · vitest.workspace.ts · docker-compose.yml · .env.example
  apps/api/src/{server.ts,plugins,routes/{webhooks,v1},auth}
  apps/worker/src/{main.ts,queues,jobs}
  apps/web/app/{(auth)/login,(app)/{inbox,leads,kanban,products,knowledge,prompts,playground,settings,analytics}}
  packages/shared/src
  packages/db/{prisma/schema.prisma,prisma/migrations,src/{client.ts,seed.ts,sql}}
  packages/core/src/{providers,agent,crm,catalog,knowledge,followup,handoff,scoring,prompts,events,tenant}
  packages/providers/src/{llm,embedding,messaging,stt,calendar,storage,trace,payment,conversion,mock}
docs/  (este diretório)
```

## 12. Decisões registradas (ADR curtas)

- **ADR-001** Plataforma em `platform/`, não na raiz — protege deploy existente; extraível.
- **ADR-002** Sem framework de agentes — state machine própria.
- **ADR-003** Postgres para tudo (relacional, FTS, vetores) — menos infra, tenant isolation por SQL.
- **ADR-004** Preço/turma/desconto só via tool determinística; nunca em prompt nem RAG.
- **ADR-005** Outbox transacional para eventos — consistência sem broker adicional.
- **ADR-006** Meta Cloud API como canal primário; WAHA não é suportado pela plataforma.
- **ADR-007** Prompts versionados no banco com `draft/staging/production`; código só tem fallback de bootstrap (seed).
