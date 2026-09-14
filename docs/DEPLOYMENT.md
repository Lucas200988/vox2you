# Deployment Guide

## Componentes

| Processo | Imagem | Porta | Escala |
|---|---|---|---|
| `api` | `platform/apps/api/Dockerfile` | 4000 | N réplicas (stateless; SSE usa Redis pub/sub) |
| `worker` | `platform/apps/worker/Dockerfile` | — | 1+ réplicas (BullMQ distribui jobs; os schedulers internos devem rodar em **uma** réplica — defina `SCHEDULERS=0` nas demais quando escalar; ver nota abaixo) |
| `web` | `platform/apps/web/Dockerfile` | 3000 | N réplicas |
| PostgreSQL 16 + pgvector | `pgvector/pgvector:pg16` | 5432 | gerenciado (RDS/Cloud SQL/Neon com pgvector) |
| Redis 7 | `redis:7-alpine` | 6379 | gerenciado |
| Object storage | S3/MinIO/R2 | — | — |

> Nota sobre schedulers: `apps/worker/src/scheduler.ts` usa `setInterval` in-process. Para múltiplas réplicas, mova para BullMQ repeatable jobs (com `jobId` fixo) — o código está isolado em um único arquivo para facilitar.

## Passo a passo (Docker Compose, single host)

```bash
cd platform
cp .env.example .env            # preencha JWT_SECRET, APP_ENCRYPTION_KEY, credenciais
docker compose up -d postgres redis minio
pnpm install && pnpm db:generate && pnpm db:deploy && pnpm db:seed
docker compose --profile app up -d --build   # api, worker, web
```

Sem Docker (dev):

```bash
pnpm dev                        # api :4000, worker, web :3000
pnpm simulate --phone 5565999990001 --text "quanto custa o academy?"
```

## Variáveis obrigatórias em produção

- `DATABASE_URL`, `REDIS_URL`
- `JWT_SECRET` (≥ 32 bytes), `APP_ENCRYPTION_KEY`
- `WEB_ORIGIN` (CORS), `PUBLIC_API_URL`
- `LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`
- `EMBEDDING_PROVIDER=openai` + `OPENAI_API_KEY` (embeddings e STT)
- `MESSAGING_PROVIDER=meta` + `WHATSAPP_*`
- `STORAGE_PROVIDER=s3` + `S3_*`
- `TRACE_SINK=langfuse` + `LANGFUSE_*` (recomendado)

A API loga em `warn` a lista `pendingCredentials` no boot e expõe em `GET /ready` — nunca sobe em produção com mock silencioso.

## Webhook do WhatsApp (Meta)

1. No app Meta → WhatsApp → Configuration → Webhook: URL `https://<api>/webhooks/whatsapp`, verify token = `WHATSAPP_VERIFY_TOKEN`.
2. Assine o campo `messages`.
3. `WHATSAPP_APP_SECRET` = App Secret (usado na validação `X-Hub-Signature-256`).
4. Cadastre o número: `Channel.externalId` = `phone_number_id` (o seed usa `WHATSAPP_PHONE_NUMBER_ID`).
5. Sincronize templates em Settings → Integrações → Templates.

## Migrations

`pnpm db:deploy` (= `prisma migrate deploy`) roda no start da imagem da API. Novas migrations: `pnpm db:migrate --name <nome>` em dev, revisar SQL gerado (extensões, índices GIN/HNSW ficam em SQL manual dentro da migration).

## Backup

- **Postgres**: `pg_dump -Fc "$DATABASE_URL" > vox-$(date +%F).dump` diariamente + WAL/PITR do provedor gerenciado. Restore: `pg_restore -d $DATABASE_URL --clean --if-exists vox.dump`. Teste o restore mensalmente em um banco vazio (`CREATE EXTENSION vector` é criado pela migration).
- **Object storage**: versionamento de bucket + replicação.
- **Redis**: apenas filas/cache — perda aceitável; jobs inbound são idempotentes (`IdempotencyKey`, `Message.providerMessageId`) e a Meta reenvia webhooks não confirmados.

## Zero-downtime

- API é stateless; use rolling update. Graceful shutdown: SIGTERM → drena requisições e fecha filas.
- Worker: SIGTERM → `Worker.close()` aguarda jobs ativos.
- Prompts, Sales Brain e conhecimento são lidos do banco (cache 15 s) — publicar não exige deploy.

## Escalabilidade

- Postgres: índices HNSW (vetor) e GIN (tsvector/trigram) já criados. Para > 1M chunks, considere particionar `knowledge_chunks` por tenant.
- Custos de IA: `AgentRun.costUsd` por execução; dashboard em Analytics. Ajuste modelos por tarefa em Agent Settings (`models`).
- Rate limits: API 300 req/min por usuário, webhook 600/min por IP, login 10/min.

## Checklist de go-live

- [ ] `pnpm typecheck && pnpm lint && RUN_INTEGRATION=1 pnpm test` verdes
- [ ] Segredos definidos; `GET /ready` sem `pendingCredentials`
- [ ] Webhook verificado na Meta e mensagem de teste respondida
- [ ] Preços/ofertas reais cadastrados (o seed usa valores placeholder)
- [ ] Base de conhecimento publicada e testada no Playground
- [ ] Usuários e unidades criados; senha do admin do seed alterada
- [ ] Backups agendados
