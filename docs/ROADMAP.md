# Roadmap

Entrega em **slices verticais**: cada slice é funcional ponta a ponta (webhook/simulação → banco → agente → UI) antes do próximo.

## Estado verificado (2026-09-14, branch `claude/brave-fermat-k7tfvc`)

- Suíte: 15 arquivos / 59 testes verdes com Postgres 16 + pgvector reais (`RUN_INTEGRATION=1 pnpm test`), `tsc -b` e ESLint limpos, `next build` do web OK.
- Fluxo comprovado por processo real (API + worker + web): simulação de WhatsApp → contato/lead/conversa → RAG híbrido → resposta da IA (mock em dev) com preço vindo **do catálogo** → guardrails → score explicado, estágio, NBA, follow-up agendado → inbox em tempo real → lead 360.
- Provedores reais (Anthropic, OpenAI, Meta Cloud, Google Calendar, S3, Langfuse, SMTP) estão implementados mas **não exercitados**: faltam credenciais (ver `INTEGRATIONS.md`).
- Preços/ofertas/turmas do seed são **placeholders** a substituir pela unidade antes de qualquer uso real.
- **Modo de venda (Configurações → Agente):** padrão **SDR**: o agente qualifica e agenda a visita presencial; nunca cita preço, parcela, desconto ou apresenta produto pelo WhatsApp (o catálogo continua carregado só para a validação, que bloqueia qualquer valor). Modo **closer** mantém o comportamento de apresentar ofertas. Testes: `tests/integration/sdr-mode.test.ts`.
- **Configuração pelo CRM:** credenciais (Anthropic, OpenAI, WhatsApp Meta, Google Calendar, Langfuse, SMTP, S3, Meta CAPI) e dados da unidade são cadastrados em Configurações, criptografados, testados com um clique e usados em runtime por tenant (API, worker e webhook). Checklist de ativação mostra o que falta para o piloto. Testes: `tests/integration/integrations.test.ts`.

## Slice 0 — Fundação (esta entrega)
- [x] Análise do repositório e riscos
- [x] Documentação (ARCHITECTURE, DOMAIN, ROADMAP, INTEGRATIONS, SECURITY)
- [x] Monorepo `platform/` (workspaces, TS, lint, vitest, docker-compose, CI)
- [x] Schema Prisma completo + migrations + seed VOX2you (unidade, pipeline, produtos, ofertas, prompts, sales brain, KB inicial)
- [x] Contratos de providers + adapters Meta Cloud API, Anthropic, OpenAI embeddings, mocks

## Slice 1 — Primeiro fluxo operacional
Objetivo: **receber mensagem WhatsApp (real ou simulada) → identificar/criar contato → armazenar conversa → consultar conhecimento → responder com IA → atualizar lead → exibir na inbox.**
- [x] Webhook Meta (verify + HMAC) → fila
- [x] Orchestrator: normalize → identify → memory → classify → extract → stage → retrieve → tools(catálogo) → generate → validate → send → CRM → events
- [x] Ingestão de conhecimento (txt/md/csv/pdf/docx/xlsx/url) + busca híbrida
- [x] API v1: auth, conversas, mensagens, contatos, leads, produtos, KB, prompts, playground, SSE
- [x] Web: login, inbox em tempo real, lead 360, kanban, produtos, KB, prompts, playground
- [x] Testes: unit + integração (Postgres/pgvector real) + cenários simulados

## Slice 2 — Qualificação e pipeline
- [x] Lead scoring híbrido com fatores explicados; pesos configuráveis
- [x] Next Best Action / mensagem / follow-up
- [x] Transições de estágio automáticas/sugeridas
- [x] SLA por estágio com alertas (horas máximas editáveis em Configurações → Funil / SLA; selo e contador no kanban; evento `lead.inactive` + notificação ao responsável, 1x por lead/dia)
- [ ] Motivos de perda com sugestão IA vs confirmado (schema pronto; UI parcial)

## Slice 3 — Handoff humano e Inbox completa
- [x] Regras de handoff (explícito, emocional, desconto, baixa confiança, B2B complexo)
- [x] Pausa da IA, resumo de handoff, retomada com contexto
- [x] Copilot (sugerir, melhorar, resumir, próxima ação) — somente com ação humana
- [x] Atribuição automática por rodízio (menos leads abertos primeiro; handoff recomenda e atribui; `POST /leads/:id/auto-assign` + botão no painel do lead). Times: pendente
- [x] Notificações para o vendedor: sino no CRM (tempo real via SSE) + e-mail quando o SMTP está configurado em Integrações — handoff, SLA estourado, visita sem desfecho, tarefa atribuída; sem repetição em 24h; `notifyByEmail: false` em `User.settings` desliga o e-mail por usuário. Push (browser/mobile): pendente

## Slice 4 — Agenda
- [x] `CalendarProvider` + agenda interna + Google Calendar (aguarda credencial)
- [x] Tools do agente `get_available_slots`, `create_appointment` (agendamento validado contra os slots buscados)
- [x] API/inbox: listar, criar, remarcar (`/appointments/:id/reschedule`) e mudar status (confirmado, compareceu, no-show, cancelado)
- [x] Tools do agente para remarcar/cancelar via conversa (`reschedule_appointment` / `cancel_appointment`, visita atual injetada no prompt, nunca cria segunda visita)
- [x] Lembretes automáticos 24h e 2h antes (texto na janela, template aprovado fora dela, tarefa ao consultor sem template) + resultado da visita (tarefa após 2h; no-show automático após 24h com follow-up de reagendamento)

## Slice 5 — Follow-up inteligente
- [x] Motor de decisão de follow-up (se/quando/por quê/objetivo/conteúdo/template/escalar/encerrar)
- [x] Política de frequência e respeito a opt-out / "me chama mês que vem"
- [ ] Estratégias por cenário (preço e sumiu, abandonou agenda…) refinadas com dados reais

## Slice 6 — Campanhas e templates
- [x] Gestão de templates (`/settings/templates`, sync Meta via `MessagingProvider.listTemplates`) e envio de template fora da janela de 24h pela inbox
- [ ] Segmentação + envio em lote com limites e timezone (schema `Campaign`/`CampaignRecipient` pronto; sem motor/UI)
- [ ] Métricas de campanha

## Slice 7 — Analytics
- [x] Eventos de domínio modelados (outbox) desde o Slice 1
- [x] Dashboard executivo inicial (leads, qualificados, agendamentos, conversão, IA vs humano, custo IA)
- [ ] Métricas conversacionais completas (FRT, tempo até qualificação, abandono)
- [ ] Insights automáticos ("campanha X converte 2,3x")

## Slice 8 — Avaliação e melhoria controlada
- [x] `Evaluation` + scorecards (avaliador LLM) + avaliação humana por conversa (`/conversations/:id/evaluations`) + feedback 👍/👎 por mensagem
- [ ] Datasets (schema `Dataset`/`DatasetItem` pronto; sem API/UI)
- [ ] Comparação A/B prompt/modelo no playground (playground já aceita versão de prompt e modelo por execução)
- [ ] Pipeline de sugestão de melhoria com aprovação humana

## Slice 9 — Conectores P1
- [ ] Instagram/Messenger via `ChannelProvider`
- [ ] Meta Conversions API (`ConversionProvider` pronto; adapter aguarda credencial)
- [ ] Pagamentos (Mercado Pago/Asaas/Stripe) via `PaymentProvider`
- [ ] HubSpot/Kommo/Pipedrive sync
- [ ] Google Sheets/Drive, Slack, n8n/Zapier/Make

## Slice 10 — Operação
- [ ] Migrar `vox2you-estoque` para `platform/apps/estoque` (após ajuste do Root Directory no Vercel)
- [x] Deploy de produção em um host: `docker-compose.prod.yml` (Caddy HTTPS automático, Postgres+pgvector, Redis, api, worker, web) + `ops/deploy.sh`
- [x] Backups automatizados (diário, retenção, off-host via rclone) com restore verificado semanalmente (`ops/backup/`); scripts testados contra Postgres real
- [x] Métricas Prometheus em `GET /metrics` + regras de alerta + stack opcional (Prometheus/Alertmanager/Grafana)
- [x] Flag `SCHEDULERS` no worker para réplicas extras
- [x] Schedulers do worker seguros para múltiplas réplicas (lock por tick no Redis, `vox:scheduler:<nome>`; tarefas idempotentes)
- [x] Lockout progressivo por conta no login (5 falhas → 1 min, dobrando até 30 min; limpa no sucesso), além do rate limit por IP
- [ ] Build das imagens Docker validado em CI (o sandbox de desenvolvimento não tem daemon Docker)
- [ ] Runbooks
