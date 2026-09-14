# Integrações

Todas as integrações passam por **contratos** em `platform/packages/core/src/providers/` e **adapters** em `platform/packages/providers/src/`. Nenhum módulo de domínio importa SDK externo diretamente. Cada contrato tem um adapter **mock/sandbox** para desenvolvimento, testes e playground.

Credenciais são lidas de variáveis de ambiente (ver `platform/.env.example`) ou de `Integration.credentialsRef` (cifrado com `APP_ENCRYPTION_KEY`). Nenhuma credencial vai para o Git.

## Status

| Contrato | Adapter | Status | Credencial |
|---|---|---|---|
| `MessagingProvider` | `MetaCloudApiProvider` | Implementado (Graph API v21) | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` — **pendente** |
| `MessagingProvider` | `MockMessagingProvider` | Implementado | — |
| `MessagingProvider` | Twilio / Blip / Zenvia / WATI | Interface pronta; não implementado | — |
| `LLMProvider` | `AnthropicLLMProvider` | Implementado | `ANTHROPIC_API_KEY` — **pendente** |
| `LLMProvider` | `OpenAILLMProvider` | Implementado (chat completions) | `OPENAI_API_KEY` |
| `LLMProvider` | `MockLLMProvider` | Implementado (scripted, determinístico) | — |
| `EmbeddingProvider` | `OpenAIEmbeddingProvider` | Implementado (`text-embedding-3-small`, 1536d) | `OPENAI_API_KEY` — **pendente** |
| `EmbeddingProvider` | `HashEmbeddingProvider` | Implementado (determinístico, para testes/dev) | — |
| `SpeechToTextProvider` | `OpenAIWhisperProvider` | Implementado | `OPENAI_API_KEY` |
| `SpeechToTextProvider` | `MockSttProvider` | Implementado | — |
| `SpeechToTextProvider` | Deepgram / Google / AWS | Interface pronta | — |
| `CalendarProvider` | `InternalCalendarProvider` | Implementado (slots por regras de horário da unidade) | — |
| `CalendarProvider` | `GoogleCalendarProvider` | Implementado (freebusy + events) | `GOOGLE_SERVICE_ACCOUNT_JSON` ou OAuth — **pendente** |
| `CalendarProvider` | Outlook / Calendly | Interface pronta | — |
| `StorageProvider` | `S3StorageProvider` | Implementado (S3/MinIO/R2) | `S3_*` |
| `StorageProvider` | `LocalFsStorageProvider` | Implementado | — |
| `TraceSink` | `LangfuseTraceSink` | Implementado | `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL` — **pendente** |
| `TraceSink` | `ConsoleTraceSink` / `DbTraceSink` | Implementado | — |
| `EmailProvider` | `SmtpEmailProvider` | Implementado (nodemailer) | `SMTP_*` |
| `PaymentProvider` | Mercado Pago / Asaas / Pagar.me / Stripe | Interface + `MockPaymentProvider` | — |
| `ConversionProvider` | Meta CAPI | Interface + `NoopConversionProvider` | `META_CAPI_TOKEN`, `META_PIXEL_ID` |
| Webhooks genéricos / n8n | `call_webhook` action | Implementado (HMAC assinado) | — |

## Configuração pelo CRM (sem .env)

Todas as credenciais acima podem ser cadastradas em **Configurações → Integrações** pelo owner/admin da conta, sem acesso ao servidor:

- **Onde fica:** tabela `integrations`; valores não sensíveis em `config`, segredos em `credentials_enc` (AES-256-GCM com `APP_ENCRYPTION_KEY`). A API nunca devolve segredos, só uma dica (`••••1234`); deixar o campo em branco ao salvar mantém o segredo atual.
- **Escopo:** Anthropic, OpenAI, Langfuse, SMTP, S3 e Meta CAPI valem para a conta; WhatsApp e Google Calendar são por unidade. Ao salvar o WhatsApp, o canal da unidade é criado/atualizado com o `phone_number_id` (globalmente único; um número de outra conta é recusado).
- **Testar conexão:** cada integração tem um teste vivo e barato (lista de modelos, leitura do número na Meta, leitura do calendário, `HeadBucket`, `verify` SMTP). O status vira `connected` ou `error` com a mensagem do provedor.
- **Runtime:** API e worker resolvem os providers **por tenant** (`TenantProviderResolver`, cache 60 s) a partir dessas credenciais, com o `.env` como fallback. O webhook do WhatsApp valida a assinatura com o app secret do tenant dono do `phone_number_id`; o handshake de verificação aceita o verify token de qualquer conta configurada.
- **Checklist de ativação:** `GET /api/v1/setup-status?unitId=` (exibido na aba Integrações) lista o que falta para o piloto: dados da unidade, WhatsApp, IA, embeddings, agente, horário de atendimento, agenda, base de conhecimento, catálogo (só em modo closer), templates, equipe.

## WhatsApp Business Platform (Meta Cloud API)

- **Webhook**: `GET /webhooks/whatsapp` (verify token) e `POST /webhooks/whatsapp` (assinatura `X-Hub-Signature-256` = HMAC-SHA256 do corpo bruto com `WHATSAPP_APP_SECRET`). O POST responde `200` em < 50 ms e enfileira.
- **Inbound**: text, image, audio, video, document, location, interactive (button/list replies), contacts, reaction, referral (Click-to-WhatsApp → atribuição), context (reply).
- **Outbound**: text, template, image/document/audio/video (por link ou media id), interactive buttons/lists, mark as read.
- **Status**: sent/delivered/read/failed atualizam `Message.status`; falhas guardam `errorCode/errorTitle`.
- **Janela 24h**: `Conversation.lastInboundAt` define a janela. Fora dela, `send_text` é recusado pelo `ConversationWindowPolicy`; apenas `send_template` com template `approved`.
- **Templates**: sincronizados via Graph API (`/{waba-id}/message_templates`) para `MessageTemplate`.
- **Opt-out**: detector determinístico (lista configurável) + classificação semântica; grava `Consent(marketing=opted_out)` e cancela follow-ups/campanhas.
- **Dedupe**: `Message.providerMessageId` único por tenant; webhooks repetidos são ignorados idempotentemente.

Configuração no painel: `Settings → Integrações → WhatsApp` (phone number id, WABA id, token, verify token, app secret). Enquanto as credenciais não existem, o `MockMessagingProvider` permite operar a inbox e o playground.

## LLM

- `LLMProvider.complete({ model, system, messages, tools?, responseSchema?, maxTokens, temperature })` → `{ text, toolCalls, usage, latencyMs, cost }`.
- Seleção de modelo por tarefa em `AgentSettings.models` (`classify`, `extract`, `generate`, `validate`, `summarize`, `evaluate`, `copilot`). Defaults: rápido para classify/extract/summarize, superior para generate.
- Fallback: `FallbackLLMProvider([primary, secondary])` com circuit breaker (3 falhas → 60 s aberto).
- Custo estimado por tabela de preços em `providers/llm/pricing.ts` (editável).

## Embeddings

`EmbeddingProvider.embed(texts[]) → number[][]`. Dimensão configurada em `KNOWLEDGE_EMBEDDING_DIM` (default 1536). Trocar de provider exige reindexar (`npm run kb:reindex`).

## Áudio

`SpeechToTextProvider.transcribe({ buffer, mime, languageHint }) → { text, language, confidence, durationSec }`. O worker baixa a mídia (`MessagingProvider.downloadMedia`), armazena (`StorageProvider`), transcreve e grava `Message.transcript`; o agente recebe o transcript como texto.

## Calendário

`CalendarProvider`: `getAvailableSlots({ calendarId, from, to, durationMin })`, `createAppointment`, `rescheduleAppointment`, `cancelAppointment`, `getAppointment`. Datas em UTC; `Unit.timezone` para exibição. `InternalCalendarProvider` usa `Calendar.availabilityRules` (dias/horários) menos `Appointment`s existentes.

## Pagamentos

`PaymentProvider.createCharge({ offerId, leadId, amount(from Offer), method })`. O valor **sempre** vem de `Offer` + `PricingRules`; o LLM só pode pedir `create_payment_link(offer_id)`. Validação determinística antes de qualquer chamada externa.

## Conversões (Meta CAPI)

`ConversionProvider.track({ eventName, contact(hashed), attribution, value })`. Disparado por automação nos eventos `lead.created`, `lead.qualified`, `appointment.created`, `appointment.completed`, `deal.won`.

## CRMs externos (P1)

Interface `CrmSyncProvider` (`upsertContact`, `upsertDeal`, `pull`) para HubSpot/Kommo/Pipedrive/RD Station. Objetivo: migração e coexistência. O CRM nativo é a fonte de verdade.

## n8n / Zapier / Make

- Entrada: `POST /api/v1/ingest/events` com API key (scopes `events:write`).
- Saída: `Webhook` de tenant assinado (`X-Vox-Signature`), com retry e `WebhookDelivery` log.

## Subprocessadores (LGPD)

| Fornecedor | Finalidade | Dados |
|---|---|---|
| Meta Platforms | Transporte de mensagens WhatsApp | telefone, conteúdo |
| Anthropic | Geração/classificação de texto | conteúdo da conversa (com redação de dados sensíveis configurável) |
| OpenAI | Embeddings e transcrição | trechos de documentos; áudios |
| Google | Calendário | nome, e-mail, horário |
| Langfuse (self-host recomendado) | Observabilidade | prompts/respostas (mascarados) |
| Provedor S3 | Mídia | arquivos |
