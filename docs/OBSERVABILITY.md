# Observabilidade

## Camadas

1. **Logs estruturados (pino)** — `api` e `worker`. Campos sensíveis redigidos (`authorization`, `token`, `password`, `apiKey`, `credentials`). Telefones/e-mails aparecem mascarados quando logados via `maskPhone/maskEmail`.
2. **Auditoria da IA no banco** — `AgentRun` (por mensagem): etapas com latência/tokens/custo, classificação, fatos extraídos, retrieval (`sourceIds`, `retrievalScore`), decisão (`reply | handoff | silent | template_required | blocked`), validação (issues), versões de prompt/sales brain/conhecimento; `ToolCall` (input/output/erro). Visível na Inbox ("Auditoria da IA"), no Playground e em Analytics → Agent runs.
3. **Traces (Langfuse)** — `TraceSink`. Com `TRACE_SINK=langfuse`, cada run vira um trace (`sessionId = conversationId`, `userId = leadId`, tags tenant/unit) com spans por etapa e generations com modelo/tokens/custo. PII mascarada antes do envio (`maskPii`). Sem credencial, `ConsoleTraceSink` loga em `debug`.
4. **Eventos de domínio** — `domain_events` é o log imutável para analytics (leads, estágios, handoffs, follow-ups, consentimentos, runs). Base para as métricas de `AnalyticsService`.
5. **Health** — `GET /health` (liveness), `GET /ready` (Postgres + Redis + status dos providers e credenciais pendentes).

## Langfuse self-hosted

Descomente o serviço `langfuse` no `docker-compose.yml`, crie o projeto e defina `LANGFUSE_PUBLIC_KEY/SECRET_KEY/BASE_URL`. Datasets de avaliação: use `Dataset`/`DatasetItem` no banco (exportáveis) ou os datasets do Langfuse a partir dos traces.

## Métricas (Prometheus) — `GET /metrics`

Expostas pela API (`apps/api/src/plugins/metrics.ts`, sem dependência externa; o Caddy bloqueia a rota externamente e `METRICS_TOKEN` pode exigir bearer):

| Métrica | Tipo | Uso |
|---|---|---|
| `vox_http_requests_total{method,route,status}` | counter | taxa de 5xx, volume por rota |
| `vox_http_request_duration_seconds{method,route}` | histogram | p95 por rota (webhook precisa responder < 2 s para a Meta) |
| `vox_dependency_up{dependency=database\|redis}` | gauge | readiness |
| `vox_queue_jobs{queue,state}` | gauge | filas BullMQ (waiting/active/delayed/failed/completed) |
| `vox_outbox_unpublished` | gauge | eventos de domínio esperando o scheduler; sobe = worker parado |
| `vox_followups_overdue` | gauge | follow-ups vencidos há > 5 min |
| `vox_agent_runs_1h{decision}` | gauge | reply / handoff / blocked / silent na última hora |
| `vox_agent_cost_usd_1h` | gauge | gasto de LLM na última hora |
| `vox_pending_credentials` | gauge | provedores ainda em mock/local (só conta em produção) |

Stack pronta: `docker compose -f docker-compose.prod.yml --profile monitoring up -d` (Prometheus + Alertmanager + Grafana com datasource provisionado; ver `DEPLOYMENT.md`). Latência por etapa do agente (`AgentRun.steps`) e confiança média ficam no dashboard interno `/analytics` e no Langfuse.

## Alertas (regras em `platform/ops/prometheus/alerts.yml`)

- `ApiDown`, `DependencyDown`: API ou Postgres/Redis fora por 2 min (crítico).
- `HighErrorRate`: 5xx > 5% por 5 min (crítico). `WebhookSlow`: p95 do webhook > 2 s.
- `QueueBacklog`, `QueueFailures`, `OutboxStuck`, `FollowUpsOverdue`: worker parado ou lento.
- `AgentBlockedRatioHigh`: > 20% de respostas bloqueadas pela validação em 1 h (catálogo/base desatualizados ou prompt regredido). `AgentCostSpike`: > US$ 20/h.
- `PendingCredentialsInProduction`: API em produção com provedores mock.
- Sem a stack: monitor externo em `GET /ready` (≠ 200 por 2 min) é o mínimo.

## Avaliação contínua

- `POST /api/v1/conversations/:id/evaluate` gera scorecard IA; `POST .../evaluations` registra avaliação humana.
- Compare `Evaluation.promptVersions`/`model` para A/B: exporte por SQL ou via Analytics → Agent runs.
- Nunca altere prompts de produção automaticamente: o fluxo é draft → staging (Playground `env=staging`) → produção → rollback, com `AuditLog`.
