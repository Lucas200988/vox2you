# Roadmap

Entrega em **slices verticais**: cada slice é funcional ponta a ponta (webhook/simulação → banco → agente → UI) antes do próximo.

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
- [ ] SLA por estágio com alertas
- [ ] Motivos de perda com sugestão IA vs confirmado (schema pronto; UI parcial)

## Slice 3 — Handoff humano e Inbox completa
- [x] Regras de handoff (explícito, emocional, desconto, baixa confiança, B2B complexo)
- [x] Pausa da IA, resumo de handoff, retomada com contexto
- [x] Copilot (sugerir, melhorar, resumir, próxima ação) — somente com ação humana
- [ ] Atribuição automática por time/round-robin
- [ ] Notificações (push/e-mail) para vendedor

## Slice 4 — Agenda
- [x] `CalendarProvider` + agenda interna + Google Calendar (aguarda credencial)
- [x] Tools `get_available_slots`, `create_appointment`, `reschedule`, `cancel`, `get`
- [ ] Lembretes automáticos (template) + no-show handling

## Slice 5 — Follow-up inteligente
- [x] Motor de decisão de follow-up (se/quando/por quê/objetivo/conteúdo/template/escalar/encerrar)
- [x] Política de frequência e respeito a opt-out / "me chama mês que vem"
- [ ] Estratégias por cenário (preço e sumiu, abandonou agenda…) refinadas com dados reais

## Slice 6 — Campanhas e templates
- [x] Gestão de templates (sync Meta)
- [ ] Segmentação + envio em lote com limites e timezone
- [ ] Métricas de campanha

## Slice 7 — Analytics
- [x] Eventos de domínio modelados (outbox) desde o Slice 1
- [x] Dashboard executivo inicial (leads, qualificados, agendamentos, conversão, IA vs humano, custo IA)
- [ ] Métricas conversacionais completas (FRT, tempo até qualificação, abandono)
- [ ] Insights automáticos ("campanha X converte 2,3x")

## Slice 8 — Avaliação e melhoria controlada
- [x] `Evaluation` + scorecards + avaliação humana
- [x] Datasets
- [ ] Comparação A/B prompt/modelo no playground
- [ ] Pipeline de sugestão de melhoria com aprovação humana

## Slice 9 — Conectores P1
- [ ] Instagram/Messenger via `ChannelProvider`
- [ ] Meta Conversions API (`ConversionProvider` pronto; adapter aguarda credencial)
- [ ] Pagamentos (Mercado Pago/Asaas/Stripe) via `PaymentProvider`
- [ ] HubSpot/Kommo/Pipedrive sync
- [ ] Google Sheets/Drive, Slack, n8n/Zapier/Make

## Slice 10 — Operação
- [ ] Migrar `vox2you-estoque` para `platform/apps/estoque` (após ajuste do Root Directory no Vercel)
- [ ] Backups automatizados e restore testado
- [ ] Runbooks
