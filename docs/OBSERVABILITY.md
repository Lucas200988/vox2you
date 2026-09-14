# Observabilidade

## Camadas

1. **Logs estruturados (pino)** — `api` e `worker`. Campos sensíveis redigidos (`authorization`, `token`, `password`, `apiKey`, `credentials`). Telefones/e-mails aparecem mascarados quando logados via `maskPhone/maskEmail`.
2. **Auditoria da IA no banco** — `AgentRun` (por mensagem): etapas com latência/tokens/custo, classificação, fatos extraídos, retrieval (`sourceIds`, `retrievalScore`), decisão (`reply | handoff | silent | template_required | blocked`), validação (issues), versões de prompt/sales brain/conhecimento; `ToolCall` (input/output/erro). Visível na Inbox ("Auditoria da IA"), no Playground e em Analytics → Agent runs.
3. **Traces (Langfuse)** — `TraceSink`. Com `TRACE_SINK=langfuse`, cada run vira um trace (`sessionId = conversationId`, `userId = leadId`, tags tenant/unit) com spans por etapa e generations com modelo/tokens/custo. PII mascarada antes do envio (`maskPii`). Sem credencial, `ConsoleTraceSink` loga em `debug`.
4. **Eventos de domínio** — `domain_events` é o log imutável para analytics (leads, estágios, handoffs, follow-ups, consentimentos, runs). Base para as métricas de `AnalyticsService`.
5. **Health** — `GET /health` (liveness), `GET /ready` (Postgres + Redis + status dos providers e credenciais pendentes).

## Langfuse self-hosted

Descomente o serviço `langfuse` no `docker-compose.yml`, crie o projeto e defina `LANGFUSE_PUBLIC_KEY/SECRET_KEY/BASE_URL`. Datasets de avaliação: use `Dataset`/`DatasetItem` no banco (exportáveis) ou os datasets do Langfuse a partir dos traces.

## Métricas sugeridas (Prometheus/Grafana — não incluído)

- Fila: `bullmq` waiting/active/failed por queue (`/api/v1/analytics` não cobre filas; use Bull Board ou exporter).
- API: p95 latência por rota (pino → Loki) e taxa de 5xx.
- IA: custo/dia, latência p95 por etapa (`AgentRun.steps`), % `blocked`, % `handoff`, confiança média.
- Negócio: dashboard interno em `/analytics`.

## Alertas recomendados

- `GET /ready` ≠ 200 por 2 min.
- Dead-letter queue (`dead-letter`) com jobs novos.
- `AgentRun.decision = blocked` > 5% em 1 h (indica catálogo/base desatualizados ou prompt regredido).
- `pendingCredentials` não vazio em produção.

## Avaliação contínua

- `POST /api/v1/conversations/:id/evaluate` gera scorecard IA; `POST .../evaluations` registra avaliação humana.
- Compare `Evaluation.promptVersions`/`model` para A/B: exporte por SQL ou via Analytics → Agent runs.
- Nunca altere prompts de produção automaticamente: o fluxo é draft → staging (Playground `env=staging`) → produção → rollback, com `AuditLog`.
