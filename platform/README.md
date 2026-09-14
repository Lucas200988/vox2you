# VOX2you Conversational CRM + AI Sales Agent

Plataforma própria de CRM conversacional com agente comercial de IA para WhatsApp, multi-tenant/multi-unidade, projetada como fundação de produto SaaS.

Documentação: [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) · [`DOMAIN`](../docs/DOMAIN.md) · [`ROADMAP`](../docs/ROADMAP.md) · [`INTEGRATIONS`](../docs/INTEGRATIONS.md) · [`SECURITY`](../docs/SECURITY.md) · [`DEPLOYMENT`](../docs/DEPLOYMENT.md) · [`OBSERVABILITY`](../docs/OBSERVABILITY.md)

## Quickstart (dev)

Pré-requisitos: Node 22, pnpm 10, Docker (para Postgres+pgvector, Redis, MinIO) — ou instâncias locais equivalentes.

```bash
cd platform
cp .env.example .env                # sem credenciais tudo roda com providers mock/local
docker compose up -d postgres redis minio
pnpm install
pnpm db:generate && pnpm db:deploy  # migrations (pgvector, tsvector, índices)
pnpm db:seed                        # tenant VOX2you, unidade, admin, produtos, prompts, sales brain, KB
pnpm dev                            # api :4000 (docs em /docs), worker, web :3000
```

Login inicial: `admin@vox2you.local` / `admin12345` (defina `SEED_ADMIN_*` no `.env`).

Simular um lead sem WhatsApp real:

```bash
pnpm simulate --phone 5565999990001 --name "Ana" --text "tenho vergonha de falar em público, quanto custa?"
```

Ou pela API: `POST /api/v1/simulate/inbound` (admin) — e acompanhe na Inbox.

## Estrutura

```
apps/api        Fastify 5 — webhooks Meta, REST v1 (OpenAPI em /docs), SSE, auth JWT/RBAC
apps/worker     BullMQ — inbound → agente, outbound, ingestão de conhecimento, follow-ups, eventos/automações
apps/web        Next.js 16 — inbox, lead 360, kanban, catálogo, conhecimento, prompts, playground, analytics, settings
packages/shared Tipos, schemas Zod, utilidades puras
packages/db     Prisma 7 + pgvector (schema, migrations)
packages/core   Domínio + AgentOrchestrator + contratos de providers (sem SDKs externos)
packages/providers Adapters: Anthropic, OpenAI, Meta Cloud API, Google Calendar, S3, Langfuse, SMTP + mocks
tests/integration Testes ponta a ponta contra Postgres/pgvector reais
```

## Scripts

| Comando | Descrição |
|---|---|
| `pnpm typecheck` | `tsc -b` em todos os pacotes |
| `pnpm lint` / `pnpm format` | ESLint / Prettier |
| `pnpm test` | Vitest (unit + integração se `DATABASE_URL` estiver definido) |
| `RUN_INTEGRATION=1 pnpm test` | Força integração (precisa Postgres com pgvector e Redis) |
| `pnpm db:migrate --name x` | Nova migration (dev) |
| `pnpm build` | Build de api/worker/packages; `pnpm build:web` para o web |

## Credenciais externas

Nenhuma é obrigatória para desenvolver. Cada uma habilita o adapter real (ver `docs/INTEGRATIONS.md`): `ANTHROPIC_API_KEY` (LLM), `OPENAI_API_KEY` (embeddings/STT), `WHATSAPP_*` (Meta Cloud API), `GOOGLE_SERVICE_ACCOUNT_JSON` (Calendar), `S3_*`, `LANGFUSE_*`, `SMTP_*`, `META_PIXEL_ID/META_CAPI_TOKEN`. `GET /ready` lista as pendentes.
