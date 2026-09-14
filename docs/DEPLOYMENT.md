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

> Nota sobre schedulers: `apps/worker/src/scheduler.ts` usa `setInterval` in-process. A réplica com `SCHEDULERS=1` roda outbox, follow-ups, SLA e limpeza; réplicas extras devem subir com `SCHEDULERS=0`. Para eliminar essa restrição, mova para BullMQ repeatable jobs (item do roadmap).

## Produção em um host (recomendado para o piloto)

Pré-requisitos: VPS Linux (2 vCPU / 4 GB é suficiente para uma unidade), Docker 24+ com Compose v2, dois registros DNS A apontando para o host (`app.` e `api.`), portas 80/443 abertas.

```bash
git clone <repo> && cd vox2you/platform
cp .env.example .env
# preencha: DOMAIN_APP, DOMAIN_API, ACME_EMAIL, POSTGRES_PASSWORD, JWT_SECRET, APP_ENCRYPTION_KEY
#           (openssl rand -base64 48), NODE_ENV=production, LLM_PROVIDER=anthropic + chave, etc.
./ops/deploy.sh --seed          # build, sobe tudo, migra, espera /ready, roda o seed
```

O que `docker-compose.prod.yml` sobe: **Caddy** (HTTPS automático via Let's Encrypt, proxy para web e API, bloqueia `/metrics` e `/docs` externamente), **Postgres 16 + pgvector**, **Redis**, `api`, `worker`, `web`, e o serviço **backup** (dump diário + verificação semanal de restore). Nada além de 80/443 fica exposto.

Atualizar uma versão: `git pull && ./ops/deploy.sh --backup` (faz backup antes de trocar as imagens). Logs: `docker compose -f docker-compose.prod.yml logs -f api worker`.

Webhook da Meta: `https://<DOMAIN_API>/webhooks/whatsapp` (ver seção abaixo).

## Desenvolvimento / staging sem HTTPS (Docker Compose local)

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

## Backup e restore

O serviço `backup` do compose de produção (`ops/backup/`) faz, sem intervenção:

- **Diário** às `BACKUP_HOUR` UTC: `pg_dump` em formato custom comprimido → volume `backups` (`/backups/vox-<data>.dump` + sha256 + link `latest.dump`), retenção `BACKUP_KEEP_DAYS`.
- **Off-host** (recomendado): copie `ops/backup/rclone.conf.example` para `rclone.conf` (git-ignored), configure um remote S3/R2/B2 e defina `BACKUP_RCLONE_REMOTE=<remote>:<bucket>/<prefixo>`. O dump e o checksum são enviados após cada backup.
- **Restore testado toda semana**: aos domingos, após o backup, `restore.sh latest.dump --verify` restaura em um banco temporário, imprime contagens de linhas e o descarta. Falhas aparecem no log do container como `WEEKLY RESTORE VERIFY FAILED` (adicione um alerta de log ou use o Prometheus abaixo).

Comandos manuais:

```bash
C="docker compose -f docker-compose.prod.yml"
$C exec backup backup.sh                                   # backup agora
$C exec backup restore.sh /backups/latest.dump --verify    # ensaio de restore (não toca no banco real)
$C stop api worker && $C exec backup restore.sh /backups/vox-20260914-030000.dump && $C start api worker   # restore real
```

- **Object storage** (mídias): volume `storage` no host ou, com `STORAGE_PROVIDER=s3`, versionamento de bucket + replicação.
- **Redis**: apenas filas/cache — perda aceitável; jobs inbound são idempotentes (`IdempotencyKey`, `Message.providerMessageId`) e a Meta reenvia webhooks não confirmados.

## Monitoramento e alertas

- `GET /health` (liveness) e `GET /ready` (Postgres, Redis e status dos provedores; 503 se algo falhar). Aponte um monitor externo gratuito (UptimeRobot, Better Stack, Uptime Kuma) para `https://<DOMAIN_API>/ready` e para `https://<DOMAIN_APP>/login`. Esse é o mínimo obrigatório para o piloto.
- `GET /metrics` (Prometheus, só na rede interna; opcionalmente protegido por `METRICS_TOKEN`): latência e erros HTTP por rota, filas BullMQ por estado, outbox não publicado, follow-ups vencidos, execuções e custo da IA na última hora, provedores pendentes.
- Stack opcional: `docker compose -f docker-compose.prod.yml --profile monitoring up -d` sobe Prometheus (regras em `ops/prometheus/alerts.yml`: API fora, dependência fora, 5xx > 5%, webhook lento, fila acumulando, outbox travado, follow-ups vencidos, IA bloqueada > 20%, custo > US$ 20/h, credenciais pendentes), Alertmanager (edite o e-mail/SMTP em `ops/alertmanager/alertmanager.yml`) e Grafana em `127.0.0.1:3001` (acesse por túnel SSH: `ssh -L 3001:127.0.0.1:3001 host`).
- Rastreamento das execuções da IA: Langfuse (`TRACE_SINK=langfuse`), ver `OBSERVABILITY.md`.

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
