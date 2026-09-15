# Modelo de Domínio

Linguagem ubíqua da plataforma. Nomes de entidades correspondem aos modelos Prisma em `platform/packages/db/prisma/schema.prisma`.

## 1. Organização

| Entidade | Descrição |
|---|---|
| **Tenant** | Cliente SaaS (ex.: rede VOX2you). Fronteira absoluta de dados. |
| **Unit** | Unidade/franquia dentro do tenant. Tem timezone, calendário, preços, catálogo, base de conhecimento, usuários. |
| **User** | Pessoa que usa o painel. Papéis: `owner`, `admin`, `manager`, `seller`, `viewer`. Membro de um tenant, com acesso a N units (`UserUnit`). |
| **Team** | Agrupamento de usuários para roteamento/atribuição. |
| **ApiKey** | Chave com scopes para integrações (public API). |

## 2. Contatos e conversas

| Entidade | Descrição |
|---|---|
| **Contact** | Pessoa (perfil 360). Identificadores por canal em `ContactIdentity(channel, externalId)` — o mesmo humano pode ter WhatsApp e Instagram. Campos opcionais: nome, e-mail, empresa, cargo, cidade, origem, UTMs, consentimentos. Nada obrigatório além de tenant + uma identidade. |
| **Company** | Conta B2B. Contatos podem apontar para uma empresa. |
| **Conversation** | Sessão contínua de mensagens em um canal com um contato. Tem `mode: ai | human | paused`, `assigneeId`, `summary`, `lastInboundAt` (janela 24h), `status: open | closed`. |
| **Message** | Mensagem individual. `direction: inbound | outbound`, `type: text | audio | image | document | video | location | interactive | template | system`, `status` (queued→sent→delivered→read | failed), `providerMessageId` (dedupe), `authorType: contact | agent | user | system`, `transcript` para áudio, `payload` bruto do provider. |
| **Attachment** | Mídia armazenada via `StorageProvider` (chave, mime, tamanho, transcrição). |

## 3. CRM

| Entidade | Descrição |
|---|---|
| **Pipeline** / **PipelineStage** | Funis configuráveis por unidade. Estágios com `order`, `kind: open | won | lost | nurture`, `probability` default, SLA (`maxHoursInStage`). |
| **Lead** | Oportunidade de um contato em uma unidade. `stageId`, `ownerId`, `score`, `scoreBreakdown`, `probability`, `estimatedValue`, `interestProductId`, `profileType: b2c | b2b`, `nextBestAction`, `nextBestMessage`, `nextFollowupAt`, `nextFollowupReason`, `recommendedProductId`, `recommendedOwnerId`, `lostReasonId`, `lostReasonSuggestedByAi`. Um contato pode ter vários leads ao longo do tempo (um `open` por unidade). |
| **Deal** | Fechamento comercial: produto, oferta, valor, condição, status de pagamento. Criado ao chegar em `Oferta/Negociação`. |
| **LeadFact** | Fato estruturado sobre o lead: `key` (goal, pain, objection, preferred_period, decision_timeline, decision_maker, company_size, budget_signal…), `value`, `source: stated | inferred | confirmed | imported`, `status: active | stale | rejected`, `confidence`, `evidenceMessageId`. |
| **LeadScoreSnapshot** | Histórico de score com fatores explicados. |
| **Task** | Tarefa para humano (ligar, enviar proposta…), com due date e responsável. |
| **Tag** / **LeadTag** | Etiquetas por tenant. |
| **LostReason** | Motivos e submotivos configuráveis. |
| **TimelineEvent** | Linha do tempo unificada (mensagem, mudança de estágio, nota, tarefa, agendamento, handoff, pagamento, evento de campanha). Derivado de `DomainEvent`. |
| **Note** | Nota interna do vendedor. |

## 4. Catálogo

| Entidade | Descrição |
|---|---|
| **Product** | Produto/curso da unidade: nome, categoria, modalidade, descrição, personas, dores, benefícios, duração, formato, status, `salesArguments`, `objectionHandlers`, materiais. |
| **Offer** | Oferta comercial vigente de um produto: preço, preço promocional, parcelamento, condições, `validFrom/validTo`, regras de desconto permitidas (`maxDiscountPct`, `requiresApproval`). O agente só cita valores de ofertas **ativas e vigentes**. |
| **ClassSchedule** | Turma: produto, unidade, início, fim, dias/horários, capacidade, vagas, status. |

## 5. Conhecimento

| Entidade | Descrição |
|---|---|
| **KnowledgeDocument** | Documento fonte: `sourceType (upload | url | text | faq | transcript)`, categoria, `productId?`, `unitId?` (null = global do tenant), `validFrom/validTo`, `priority`, `version`, `status: draft | published | expired | archived`, `checksum`. |
| **KnowledgeChunk** | Pedaço indexado: `content`, `tsv`, `embedding`, `ordinal`, `metadata`. |
| **SalesBrain** | Configuração comercial editável por unidade: metodologia, perguntas de descoberta, gatilhos, personas, provas, histórias, objeções→respostas, concorrentes, regras de desconto, critérios de qualificação e de handoff. Armazenado como documento estruturado versionado (`SalesBrainVersion`). |

## 6. Agente

| Entidade | Descrição |
|---|---|
| **Prompt** / **PromptVersion** | Prompts nomeados (`conversation.system`, `classify.intent`, `extract.facts`, `validate.reply`, `summarize.conversation`, `evaluate.conversation`, `copilot.suggest`) com versões `draft | staging | production | archived`, autor, conteúdo, variáveis. |
| **AgentSettings** | Por unidade: persona, tom, modelos por tarefa, limites (tamanho de resposta, perguntas por mensagem, mensagens de follow-up por semana), confiança mínima, regras de handoff, horários de atendimento. |
| **AgentRun** | Execução do pipeline para uma mensagem: etapas, modelo, tokens, custo, latência, confiança, `sourceIds`, `retrievalScore`, `knowledgeVersion`, decisão final, `traceId`. |
| **ToolCall** | Chamada de ferramenta dentro de um run (nome, input, output, duração, erro). |
| **Evaluation** | Avaliação de conversa/run: dimensões (accuracy, grounding, sales_quality, tone, qualification, conversion_attempt, effort, repetition, hallucination, compliance), `evaluatorType: ai | human`, comentário. |
| **Dataset** / **DatasetItem** | Casos selecionados para avaliação offline e comparação A/B. |
| **Feedback** | Feedback humano sobre uma resposta (👍/👎 + motivo). |

## 7. Agenda e follow-up

| Entidade | Descrição |
|---|---|
| **Calendar** | Agenda de uma unidade/usuário com provider (`google | internal | outlook | calendly`) e credenciais referenciadas via `Integration`. |
| **Appointment** | Compromisso: lead, contato, tipo (visita, aula experimental, reunião), início/fim em UTC, timezone, status (`scheduled | confirmed | completed | no_show | cancelled | rescheduled`), `externalId`. |
| **FollowUp** | Follow-up planejado: `scheduledAt`, `reason`, `goal`, `strategy`, `channel`, `templateId?`, `status: scheduled | sent | cancelled | skipped`, `skipReason`, `attempt`. Regras de frequência em `FollowUpPolicy`. |

## 8. Campanhas e templates

| Entidade | Descrição |
|---|---|
| **MessageTemplate** | Template WhatsApp aprovado: `name`, `language`, `category`, `status`, `components/variables`, `qualityScore`, `providerId`, `lastSyncAt`. |
| **Campaign** | Envio segmentado: filtro (segment JSON), template, agendamento, limites, status. |
| **CampaignRecipient** | Destinatário e resultado (`sent | delivered | read | replied | converted | unsubscribed | failed`). |
| **Consent** | Consentimento por contato: `purpose (marketing | service | ai_processing)`, `status (opted_in | opted_out | unknown)`, origem, evidência, timestamps. |

## 9. Integrações e automações

| Entidade | Descrição |
|---|---|
| **Integration** | Conexão configurada por tenant/unit: `kind (whatsapp_meta | google_calendar | langfuse | smtp | s3 | payment_* | crm_*)`, `status`, `config` (não sensível), `credentialsRef` (segredo cifrado). |
| **Webhook** / **WebhookDelivery** | Webhooks de saída para eventos de domínio. |
| **Automation** / **AutomationRun** | Regras `trigger → conditions → actions`. |
| **DomainEvent** (outbox) | Evento imutável: `type`, `aggregate`, `payload`, `occurredAt`, `publishedAt`. Base de analytics. |
| **AuditLog** | Quem fez o quê (usuário/sistema/agente), antes/depois, IP. |
| **Payment** | Cobrança gerada via `PaymentProvider`: valor (do `Offer`), status, provider, link. |
| **ConversionEvent** | Evento enviado a `ConversionProvider` (Meta CAPI): `Lead`, `QualifiedLead`, `Schedule`, `Visit`, `Purchase`, com atribuição. |
| **Attribution** | UTMs, fbclid, click-to-whatsapp, landing page, QR, indicação — ligado ao contato/lead. |

## 10. Máquina de estados comerciais (pipeline padrão)

```
Novo Lead → Em Conversa → Descoberta → Qualificado → Oferta/Apresentação → Agendamento → Negociação → Matrícula/Venda
                                                                                              ↘ Perdido
                                                                                              ↘ Nutrição
```
Transições sugeridas pelo agente; aplicadas automaticamente apenas quando `AgentSettings.autoStageTransitions` permite para aquela transição; caso contrário viram sugestão para o vendedor.

## 11. Sinais comerciais (não são FAQ)

Mensagens como "tenho vergonha", "achei caro", "vou pensar", "preciso falar com minha esposa" são classificadas como `signals[]` em `AgentRun.classification` e viram `LeadFact` (`pain`, `objection:price`, `objection:timing`, `decision_maker:spouse`). O Sales Brain mapeia cada sinal para estratégia e próximo passo.

## 12. Lead scoring

`score = clamp(0..100, Σ fatores determinísticos + comportamentais + ajuste IA)`. Pesos em `ScoringConfig` (por unidade). Cada snapshot guarda `factors: [{key, weight, value, points, explanation}]`. A UI mostra sempre os 3–5 principais fatores.
