import type { Db, Prisma } from '@vox/db'
import { hashPassword } from '../auth/password.js'
import { PipelineService } from '../crm/pipeline-service.js'
import { PromptRegistry } from '../prompts/registry.js'
import { DEFAULT_SALES_BRAIN } from '../sales-brain/defaults.js'
import { DEFAULT_SCORING_WEIGHTS } from '../scoring/lead-scoring.js'

export interface SeedOptions {
  tenantName?: string
  tenantSlug?: string
  unitName?: string
  unitSlug?: string
  unitCity?: string
  timezone?: string
  adminEmail: string
  adminPassword: string
  channelExternalId?: string
}

export interface SeedResult {
  tenantId: string
  unitId: string
  adminUserId: string
  channelId: string
  productIds: Record<string, string>
  knowledgeDocumentIds: string[]
}

/**
 * Idempotent bootstrap for a VOX2you unit: tenant, unit, admin, channel, pipeline, agent settings,
 * scoring, follow-up policy, calendar, prompts, sales brain, products/offers/classes and starter
 * knowledge documents (created as published+pending; ingestion runs afterwards).
 * Prices below are PLACEHOLDERS for development — replace in the admin UI.
 */
export async function seedVox2you(db: Db, opts: SeedOptions): Promise<SeedResult> {
  const tenant = await db.tenant.upsert({ where: { slug: opts.tenantSlug ?? 'vox2you' }, update: {}, create: { name: opts.tenantName ?? 'VOX2you', slug: opts.tenantSlug ?? 'vox2you' } })
  const unit = await db.unit.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: opts.unitSlug ?? 'cuiaba' } },
    update: {},
    create: { tenantId: tenant.id, name: opts.unitName ?? 'VOX2you Cuiabá', slug: opts.unitSlug ?? 'cuiaba', city: opts.unitCity ?? 'Cuiabá', state: 'MT', timezone: opts.timezone ?? 'America/Cuiaba' },
  })

  const existingAdmin = await db.user.findUnique({ where: { tenantId_email: { tenantId: tenant.id, email: opts.adminEmail } } })
  const admin =
    existingAdmin ??
    (await db.user.create({ data: { tenantId: tenant.id, email: opts.adminEmail, name: 'Administrador', role: 'owner', passwordHash: await hashPassword(opts.adminPassword), status: 'active', units: { create: { unitId: unit.id, role: 'owner' } } } }))
  const seller = await db.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'vendedor@vox2you.local' } },
    update: {},
    create: { tenantId: tenant.id, email: 'vendedor@vox2you.local', name: 'Consultor Exemplo', role: 'seller', passwordHash: await hashPassword(opts.adminPassword), status: 'active', units: { create: { unitId: unit.id, role: 'seller' } } },
  })
  void seller

  const channel = await db.channel.upsert({
    where: { tenantId_kind_externalId: { tenantId: tenant.id, kind: 'whatsapp', externalId: opts.channelExternalId ?? 'mock-phone' } },
    update: {},
    create: { tenantId: tenant.id, unitId: unit.id, kind: 'whatsapp', provider: opts.channelExternalId && opts.channelExternalId !== 'mock-phone' ? 'meta' : 'mock', externalId: opts.channelExternalId ?? 'mock-phone', name: 'WhatsApp principal' },
  })

  await db.$transaction(async (tx) => {
    await PipelineService.ensureDefaults(tx, tenant.id, unit.id)
    await PromptRegistry.seedDefaults(tx)
  })

  await db.agentSettings.upsert({
    where: { unitId: unit.id },
    update: {},
    create: {
      unitId: unit.id,
      agentName: 'Bia',
      persona: 'Consultora comercial da VOX2you: acolhedora, direta, entusiasmada com comunicação, fala como uma pessoa real no WhatsApp.',
      tone: 'Frases curtas, calor humano, zero robotismo, no máximo um emoji quando natural.',
      handoffRules: { keywords: ['cancelar matrícula', 'reembolso'] },
      businessHours: { rules: [] },
    },
  })
  await db.scoringConfig.upsert({ where: { id: (await db.scoringConfig.findFirst({ where: { unitId: unit.id } }))?.id ?? '00000000-0000-0000-0000-000000000000' }, update: {}, create: { unitId: unit.id, name: 'default', weights: DEFAULT_SCORING_WEIGHTS as Prisma.InputJsonValue } })
  await db.followUpPolicy.upsert({ where: { unitId: unit.id }, update: {}, create: { unitId: unit.id } })
  const calendar = (await db.calendar.findFirst({ where: { unitId: unit.id } })) ?? (await db.calendar.create({ data: { unitId: unit.id, name: 'Visitas e aulas experimentais', provider: 'internal', timezone: unit.timezone, isDefault: true, slotDurationMin: 60, availabilityRules: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '09:00', end: '19:00' })) } }))
  void calendar

  const brainExists = await db.salesBrainVersion.findFirst({ where: { unitId: unit.id } })
  if (!brainExists) await db.salesBrainVersion.create({ data: { unitId: unit.id, version: 1, status: 'production', content: DEFAULT_SALES_BRAIN as unknown as Prisma.InputJsonValue, changelog: 'Sales Brain inicial', publishedAt: new Date() } })

  // Products (placeholder prices — edit in admin)
  const productDefs = [
    { slug: 'academy', name: 'Academy', category: 'course', modality: 'in_person', audience: 'b2c', shortDescription: 'Curso completo de comunicação e oratória para quem quer perder a vergonha e falar com segurança.', durationText: '4 meses, 1 aula por semana', personas: ['profissional tímido', 'estudante', 'iniciante'], painsSolved: ['vergonha de falar em público', 'nervosismo', 'insegurança'], benefits: ['falar com segurança', 'estruturar ideias', 'presença'], salesArguments: ['Prática desde a primeira aula', 'Turmas pequenas com feedback individual', 'Método progressivo para quem trava'], offers: [{ name: 'Academy — turma regular', listPrice: 3990, installmentsMax: 12, installmentValue: 332.5, conditions: 'à vista com 10% de desconto ou 12x no cartão', paymentMethods: ['pix', 'card', 'boleto'], maxDiscountPct: 10 }], classes: [{ name: 'Academy Noite', weekdays: ['tue'], startTime: '19:00', endTime: '21:00', period: 'evening', capacity: 12, enrolled: 7 }, { name: 'Academy Sábado', weekdays: ['sat'], startTime: '09:00', endTime: '11:00', period: 'morning', capacity: 12, enrolled: 4 }] },
    { slug: 'master', name: 'Master', category: 'course', modality: 'in_person', audience: 'both', shortDescription: 'Programa avançado de comunicação persuasiva, liderança e apresentações de alto impacto.', durationText: '6 meses', personas: ['líder', 'vendedor', 'empreendedor', 'executivo'], painsSolved: ['apresentações', 'liderança', 'vendas', 'persuasão'], benefits: ['apresentar com impacto', 'persuadir', 'liderar reuniões'], salesArguments: ['Foco em resultados profissionais', 'Simulações reais de apresentações e negociações', 'Networking com outros líderes'], offers: [{ name: 'Master — turma regular', listPrice: 6990, installmentsMax: 12, installmentValue: 582.5, conditions: '12x no cartão ou à vista com 8% de desconto', paymentMethods: ['pix', 'card'], maxDiscountPct: 8 }], classes: [{ name: 'Master Noite', weekdays: ['thu'], startTime: '19:00', endTime: '21:30', period: 'evening', capacity: 10, enrolled: 6 }] },
    { slug: 'intensivox', name: 'Intensivox', category: 'immersion', modality: 'in_person', audience: 'b2c', shortDescription: 'Imersão intensiva de fim de semana para destravar a comunicação em vídeo e ao vivo.', durationText: '2 dias (16h)', personas: ['criador de conteúdo', 'profissional com prazo', 'vendedor'], painsSolved: ['travar na frente da câmera', 'urgência', 'falta de tempo'], benefits: ['resultado rápido', 'prática intensiva', 'gravações com feedback'], salesArguments: ['Ideal para quem tem pouco tempo', 'Destrava em um fim de semana', 'Feedback em vídeo'], offers: [{ name: 'Intensivox — próxima turma', listPrice: 1490, installmentsMax: 6, installmentValue: 248.34, conditions: '6x no cartão', paymentMethods: ['pix', 'card'], maxDiscountPct: 5 }], classes: [{ name: 'Intensivox Outubro', weekdays: ['sat', 'sun'], startTime: '08:00', endTime: '17:00', period: 'morning', capacity: 16, enrolled: 9, startsOffsetDays: 30 }] },
    { slug: 'incompany', name: 'InCompany', category: 'incompany', modality: 'hybrid', audience: 'b2b', shortDescription: 'Treinamento corporativo sob medida para times comerciais, atendimento e lideranças.', durationText: 'Sob medida (8h a 40h)', personas: ['empresa', 'RH', 'gestor comercial'], painsSolved: ['time de vendas', 'atendimento', 'apresentações corporativas', 'liderança'], benefits: ['programa customizado', 'diagnóstico prévio', 'métricas de evolução'], salesArguments: ['Diagnóstico gratuito do time', 'Conteúdo adaptado ao negócio', 'Turmas fechadas na empresa ou na unidade'], offers: [], classes: [] },
    { slug: 'voxtime', name: 'VoxTime', category: 'course', modality: 'online', audience: 'b2c', shortDescription: 'Encontros online curtos e práticos para manter a comunicação em dia.', durationText: 'Mensal, 4 encontros de 1h', personas: ['ex-aluno', 'profissional ocupado'], painsSolved: ['manter prática', 'falta de tempo'], benefits: ['flexível', 'online', 'prática contínua'], salesArguments: ['100% online', 'Ideal para manter o ritmo'], offers: [{ name: 'VoxTime mensal', listPrice: 297, installmentsMax: 1, installmentValue: null, conditions: 'assinatura mensal', paymentMethods: ['pix', 'card'], maxDiscountPct: 0 }], classes: [] },
  ]
  const productIds: Record<string, string> = {}
  for (const def of productDefs) {
    const { offers, classes, ...data } = def
    const product = await db.product.upsert({ where: { tenantId_slug: { tenantId: tenant.id, slug: def.slug } }, update: {}, create: { ...data, tenantId: tenant.id, unitId: null, status: 'active' } })
    productIds[def.slug] = product.id
    if (!(await db.offer.findFirst({ where: { productId: product.id } }))) {
      for (const o of offers) await db.offer.create({ data: { tenantId: tenant.id, productId: product.id, unitId: unit.id, name: o.name, listPrice: o.listPrice, installmentsMax: o.installmentsMax, installmentValue: o.installmentValue, conditions: o.conditions, paymentMethods: o.paymentMethods, maxDiscountPct: o.maxDiscountPct, discountRequiresApproval: true, status: 'active' } })
    }
    if (!(await db.classSchedule.findFirst({ where: { productId: product.id, unitId: unit.id } }))) {
      for (const c of classes) {
        const startsOn = new Date()
        startsOn.setDate(startsOn.getDate() + ((c as { startsOffsetDays?: number }).startsOffsetDays ?? 14))
        await db.classSchedule.create({ data: { tenantId: tenant.id, unitId: unit.id, productId: product.id, name: c.name, startsOn, weekdays: c.weekdays, startTime: c.startTime, endTime: c.endTime, period: c.period, capacity: c.capacity, enrolled: c.enrolled, status: 'open' } })
      }
    }
  }

  // Starter knowledge documents
  const docs = [
    { title: 'Como funciona a VOX2you', category: 'general', content: KB_HOW_IT_WORKS },
    { title: 'Perguntas frequentes', category: 'faq', content: KB_FAQ },
    { title: 'Política comercial e de matrícula', category: 'policy', content: KB_POLICY },
    { title: 'Objeções e como conduzir', category: 'objection', content: KB_OBJECTIONS },
  ]
  const knowledgeDocumentIds: string[] = []
  for (const d of docs) {
    const existing = await db.knowledgeDocument.findFirst({ where: { tenantId: tenant.id, title: d.title } })
    const doc = existing ?? (await db.knowledgeDocument.create({ data: { tenantId: tenant.id, unitId: null, title: d.title, category: d.category, sourceType: 'text', status: 'published', publishedAt: new Date(), priority: 7, ingestStatus: 'pending', metadata: { content: d.content } } }))
    knowledgeDocumentIds.push(doc.id)
  }

  // Templates (mock approved) so out-of-window follow-ups have something to send in dev
  for (const t of [
    { name: 'retomada_contato', language: 'pt_BR', category: 'MARKETING', body: 'Oi {{1}}, aqui é da VOX2you. Podemos continuar nossa conversa sobre {{2}}?', variables: ['nome', 'assunto'] },
    { name: 'lembrete_visita', language: 'pt_BR', category: 'UTILITY', body: 'Olá {{1}}! Lembrando da sua visita à VOX2you em {{2}}. Até lá!', variables: ['nome', 'data'] },
  ]) {
    await db.messageTemplate.upsert({ where: { tenantId_name_language: { tenantId: tenant.id, name: t.name, language: t.language } }, update: {}, create: { tenantId: tenant.id, unitId: null, name: t.name, language: t.language, category: t.category, status: 'approved', body: t.body, variables: t.variables, components: [{ type: 'BODY', text: t.body }], providerId: `local-${t.name}`, qualityScore: 'GREEN' } })
  }

  // Sample automation: notify owner when a lead is qualified
  if (!(await db.automation.findFirst({ where: { tenantId: tenant.id, trigger: 'lead.qualified' } }))) {
    await db.automation.create({ data: { tenantId: tenant.id, unitId: unit.id, name: 'Lead qualificado → tarefa para o time', trigger: 'lead.qualified', conditions: [], actions: [{ type: 'create_task', title: 'Lead qualificado pela IA: ligar em até 5 minutos', kind: 'call', dueInHours: 0.1 }, { type: 'add_tag', tag: 'qualificado-ia' }] } })
  }

  return { tenantId: tenant.id, unitId: unit.id, adminUserId: admin.id, channelId: channel.id, productIds, knowledgeDocumentIds }
}

const KB_HOW_IT_WORKS = `# Como funciona a VOX2you

A VOX2you é uma escola de comunicação e oratória. O método é prático: o aluno fala desde a primeira aula, em turmas pequenas, com feedback individual do professor.

## Estrutura das aulas
Cada aula combina uma técnica (respiração, estrutura de fala, storytelling, linguagem corporal, persuasão) com exercícios práticos gravados e comentados. O aluno acompanha a própria evolução por vídeo.

## Para quem é
Para quem sente vergonha ou nervosismo ao falar, para profissionais que precisam apresentar melhor, líderes que querem engajar equipes, vendedores que querem persuadir e pessoas que travam na frente da câmera.

## Aula experimental e visita
Qualquer interessado pode agendar uma visita à unidade ou uma aula experimental gratuita para conhecer o método antes de decidir.

## Certificado
Ao concluir o curso o aluno recebe certificado de conclusão.`

const KB_FAQ = `# Perguntas frequentes

## Preciso ter experiência?
Não. A maioria dos alunos começa do zero e muitos chegam com muita vergonha de falar.

## As aulas são presenciais ou online?
A maioria dos cursos é presencial na unidade. O VoxTime é 100% online. O InCompany pode ser híbrido.

## Quantos alunos por turma?
Turmas pequenas, geralmente entre 8 e 12 alunos, para garantir feedback individual.

## Posso repor aula se faltar?
Sim. O aluno pode repor a aula em outra turma do mesmo módulo, conforme disponibilidade.

## Como funciona o pagamento?
As condições de pagamento (à vista, parcelamento e formas aceitas) constam na oferta vigente de cada curso, informada pelo consultor.

## Onde fica a unidade?
Consulte o endereço da sua unidade com o consultor; a visita pode ser agendada pelo WhatsApp.`

const KB_POLICY = `# Política comercial e de matrícula

## Valores
Os valores, parcelamentos e promoções válidos são exclusivamente os cadastrados no catálogo da unidade. Nenhum consultor ou agente pode informar valores diferentes.

## Descontos
Descontos além do limite da oferta dependem de aprovação do gestor da unidade. O agente de IA nunca concede descontos.

## Matrícula
A matrícula é feita na unidade ou por contrato digital enviado pelo consultor após a escolha da turma.

## Cancelamento
Pedidos de cancelamento, reembolso ou trancamento são tratados exclusivamente por um atendente humano.

## Turmas
Uma turma só é confirmada com número mínimo de alunos. Vagas disponíveis são as informadas no catálogo.`

const KB_OBJECTIONS = `# Objeções comuns e como conduzir

## "Achei caro"
Validar o sentimento, retomar o objetivo da pessoa e mostrar o parcelamento vigente. Nunca oferecer desconto por conta própria. Convidar para a aula experimental para sentir o valor.

## "Não tenho tempo"
Mostrar a duração real das aulas e os períodos disponíveis. Perguntar qual período seria viável. O Intensivox é uma opção para quem tem pouco tempo.

## "Vou pensar"
Perguntar o que falta para decidir e oferecer a visita sem compromisso. Combinar um retorno com data.

## "Preciso falar com minha esposa / marido / sócio"
Oferecer um resumo para compartilhar e convidar os dois para conhecer a unidade juntos.

## "Funciona mesmo?"
Contar histórias de alunos e convidar para a aula experimental.`
