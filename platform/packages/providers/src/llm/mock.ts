import type { LLMProvider, LLMRequest, LLMResponse } from '@vox/core'
import { estimateTokens, stripAccents } from '@vox/shared'

type Responder = (req: LLMRequest) => unknown | string

/**
 * Deterministic, keyword-driven LLM mock. Produces schema-valid JSON for every pipeline task so the
 * whole platform (webhook → agent → CRM → inbox) runs end-to-end without credentials. Tests can
 * also enqueue explicit responses via `enqueue()`.
 */
export class MockLLMProvider implements LLMProvider {
  readonly name = 'mock'
  private queue: Array<{ task?: string; response: unknown }> = []
  readonly calls: LLMRequest[] = []
  private readonly overrides = new Map<string, Responder>()

  enqueue(response: unknown, task?: string): void {
    this.queue.push({ task, response })
  }

  onTask(task: string, responder: Responder): void {
    this.overrides.set(task, responder)
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    this.calls.push(req)
    const started = Date.now()
    const queued = this.queue.findIndex((q) => !q.task || q.task === req.task)
    let payload: unknown
    if (queued >= 0) payload = this.queue.splice(queued, 1)[0]!.response
    else if (req.task && this.overrides.has(req.task)) payload = this.overrides.get(req.task)!(req)
    else payload = this.defaultFor(req)
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload)
    const inputTokens = estimateTokens((req.system ?? '') + req.messages.map((m) => m.content).join(''))
    return { text, json: typeof payload === 'string' ? undefined : payload, toolCalls: [], usage: { inputTokens, outputTokens: estimateTokens(text) }, model: `mock:${req.model}`, provider: this.name, latencyMs: Date.now() - started, costUsd: 0, stopReason: 'end_turn' }
  }

  private lastCustomer(req: LLMRequest): string {
    const all = req.messages.map((m) => m.content).join('\n')
    const m = all.match(/<customer_message>\s*([\s\S]*?)\s*<\/customer_message>/)
    return stripAccents((m?.[1] ?? all).toLowerCase())
  }

  private defaultFor(req: LLMRequest): unknown {
    const text = this.lastCustomer(req)
    switch (req.task) {
      case 'classify':
        return classify(text)
      case 'extract':
        return extract(text)
      case 'generate':
        return generate(text, req)
      case 'validate':
        return { ok: true, issues: [] }
      case 'summarize':
        return 'Cliente interessado em comunicação; conversa em andamento.'
      case 'evaluate':
        return { scores: { accuracy: 8, grounding: 8, sales_quality: 7, tone: 8, qualification_quality: 7, conversion_attempt: 7, customer_effort: 8, repetition: 9, hallucination: 9, compliance: 9 }, comment: 'Avaliação simulada.' }
      case 'copilot':
        return { suggestedReply: 'Posso te mostrar como funciona a aula experimental?', detectedObjection: null, nextBestAction: 'Convidar para visita', summary: 'Lead em descoberta.', crmUpdates: [] }
      case 'followup':
        return { reply: 'Oi! Fiquei pensando no que você comentou. Posso te ajudar com algum próximo passo?' }
      default:
        return { text: 'ok' }
    }
  }
}

function has(text: string, ...words: string[]): boolean {
  return words.some((w) => text.includes(stripAccents(w)))
}

export function classify(text: string) {
  const signals: string[] = []
  let intent = 'info_request'
  let sentiment: 'positive' | 'neutral' | 'negative' | 'frustrated' = 'neutral'
  let urgency: 'low' | 'medium' | 'high' = 'low'
  let profileType: 'b2c' | 'b2b' | 'unknown' = 'unknown'
  if (has(text, 'vergonha', 'timid', 'nervos', 'travo')) signals.push('shame')
  if (has(text, 'camera', 'gravar video', 'videos')) signals.push('camera_block')
  if (has(text, 'apresenta')) signals.push('presentation')
  if (has(text, 'lideran', 'meu time', 'minha equipe', 'gestor')) signals.push('leadership')
  if (has(text, 'time de vendas', 'equipe comercial', 'treinar minha equipe', 'funcionarios', 'empresa')) {
    signals.push('team_sales')
    profileType = 'b2b'
  }
  if (has(text, 'caro', 'nao tenho dinheiro', 'valor alto')) signals.push('price_objection')
  if (has(text, 'nao tenho tempo', 'agenda corrida', 'sem tempo')) signals.push('time_objection')
  if (has(text, 'vou pensar', 'depois', 'mes que vem', 'mais tarde')) signals.push('later')
  if (has(text, 'esposa', 'marido', 'socio')) signals.push('spouse_decision')
  if (has(text, 'desconto', 'faz por menos')) signals.push('discount_request')
  if (has(text, '50 pessoas', '100 pessoas', 'toda a empresa')) signals.push('large_team')

  if (has(text, 'pare', 'nao me mande', 'sair', 'descadastr')) intent = 'opt_out'
  else if (has(text, 'atendente', 'humano', 'falar com alguem', 'pessoa de verdade')) intent = 'human_request'
  else if (has(text, 'absurdo', 'reclama', 'pessimo', 'ninguem responde', 'irritad')) {
    intent = 'complaint'
    sentiment = 'frustrated'
  } else if (has(text, 'quero me matricular', 'quero fechar', 'como faco para me inscrever', 'vamos fechar')) {
    intent = 'buying_signal'
    urgency = 'high'
  } else if (has(text, 'agendar', 'marcar', 'visita', 'aula experimental', 'conhecer a escola')) intent = 'booking_request'
  else if (has(text, 'preco', 'valor', 'quanto custa', 'investimento', 'parcel')) intent = 'price_request'
  else if (has(text, 'horario', 'turma', 'que dias', 'quando comeca')) intent = 'schedule_request'
  else if (signals.some((s) => ['price_objection', 'time_objection', 'later', 'spouse_decision'].includes(s))) intent = 'objection'
  else if (profileType === 'b2b') intent = 'b2b_inquiry'
  else if (/^(oi|ola|bom dia|boa tarde|boa noite|opa|e ai)[!. ]*$/.test(text.trim())) intent = 'greeting'
  else if (has(text, 'obrigad', 'valeu', 'blz', 'beleza')) intent = 'smalltalk'
  if (has(text, 'urgente', 'semana que vem', 'proxima semana', 'preciso rapido')) urgency = 'high'
  if (has(text, 'so quero', 'pessoal', 'para mim')) profileType = profileType === 'unknown' ? 'b2c' : profileType

  const mentionsProducts = ['academy', 'master', 'intensivox', 'incompany', 'voxtime'].filter((p) => text.includes(p))
  return {
    intent,
    secondaryIntents: [],
    sentiment,
    urgency,
    signals,
    profileType,
    needsKnowledge: intent === 'info_request' || has(text, 'como funciona', 'metodologia', 'o que e'),
    needsCatalog: ['price_request', 'schedule_request', 'buying_signal', 'info_request'].includes(intent) || mentionsProducts.length > 0,
    needsCalendar: intent === 'booking_request',
    requestsHuman: intent === 'human_request',
    isEmotional: sentiment === 'frustrated',
    mentionsProducts,
    confidence: intent === 'info_request' && !has(text, 'como funciona', 'curso') ? 0.55 : 0.9,
    reasoning: 'mock keyword classification',
  }
}

export function extract(text: string) {
  const facts: Array<{ key: string; value: string; source: 'stated' | 'inferred'; confidence: number }> = []
  const add = (key: string, value: string, source: 'stated' | 'inferred' = 'stated') => facts.push({ key, value, source, confidence: 0.9 })
  if (has(text, 'vergonha', 'timid')) add('pain', 'vergonha de falar em público')
  if (has(text, 'travo na frente da camera', 'gravar video')) add('pain', 'trava na frente da câmera')
  if (has(text, 'apresentar melhor minha empresa', 'apresentacoes')) add('goal', 'melhorar apresentações')
  if (has(text, 'melhorar meu time de vendas', 'equipe comercial')) add('goal', 'desenvolver time de vendas')
  if (has(text, 'lideranca')) add('goal', 'melhorar liderança')
  if (has(text, 'entrevista')) add('goal', 'ir bem em entrevista')
  if (has(text, 'caro')) add('objection', 'preço')
  if (has(text, 'nao tenho tempo')) add('objection', 'tempo')
  if (has(text, 'vou pensar')) add('objection', 'vou pensar')
  if (has(text, 'esposa')) add('decision_maker', 'esposa')
  if (has(text, 'noite', 'noturno')) add('preferred_period', 'noturno')
  if (has(text, 'manha')) add('preferred_period', 'manhã')
  if (has(text, 'mes que vem')) {
    const d = new Date()
    d.setMonth(d.getMonth() + 1, 1)
    add('do_not_contact_until', d.toISOString().slice(0, 10))
    add('decision_timeline', 'mês que vem')
  }
  const name = text.match(/(?:meu nome e|me chamo|sou o|sou a) ([a-z]+)/)
  if (name?.[1]) add('name', name[1].charAt(0).toUpperCase() + name[1].slice(1))
  const people = text.match(/(\d+) (pessoas|funcionarios|vendedores)/)
  if (people?.[1]) add('company_size', `${people[1]} pessoas`)
  if (has(text, 'empresa', 'equipe', 'funcionarios')) add('profile_type', 'b2b', 'inferred')
  return { facts, invalidatedKeys: [] }
}

function generate(text: string, req: LLMRequest) {
  const system = req.system ?? ''
  const c = classify(text)
  const offers = [...system.matchAll(/Ofertas: ([^\n]+)/g)].map((m) => m[1]!).filter((o) => !o.includes('NÃO cite'))
  const firstOffer = offers[0]?.split(';')[0]?.trim()
  const classes = [...system.matchAll(/Turmas: ([^\n]+)/g)].map((m) => m[1]!).filter((c) => !c.includes('sem turmas'))
  const slotLine = system.match(/- ([^\n(]+) \(iso: ([^)]+)\)/)
  const actions: unknown[] = []
  let reply = ''
  let nextBestAction = 'Continuar descoberta'
  switch (c.intent) {
    case 'greeting':
      reply = 'Oi! Que bom ter você por aqui. Me conta: o que te fez procurar a VOX2you agora?'
      break
    case 'price_request':
      reply = firstOffer ? `Claro. Hoje a condição vigente é ${firstOffer}. O que mais te ajudaria a decidir: conhecer a metodologia na prática ou entender o cronograma?` : 'Vou confirmar a condição vigente com a equipe e já te retorno. Enquanto isso, me conta qual é o seu principal objetivo?'
      nextBestAction = 'Reforçar valor e convidar para visita'
      actions.push({ type: 'set_stage', stage: 'offer', reason: 'pediu preço' })
      break
    case 'schedule_request':
      reply = classes.length ? `Temos turmas assim: ${classes[0]!.split(';')[0]}. Qual período fica melhor pra você?` : 'Vou verificar as próximas turmas com a equipe e te retorno. Você prefere manhã, tarde ou noite?'
      break
    case 'booking_request':
      if (slotLine) {
        reply = `Ótimo! Tenho ${slotLine[1]!.trim()} disponível para uma visita. Posso confirmar pra você?`
        nextBestAction = 'Confirmar horário'
        if (has(text, 'pode confirmar', 'confirma', 'fechado', 'pode ser')) actions.push({ type: 'book_appointment', isoStart: slotLine[2], kind: 'visit' })
      } else {
        reply = 'Vou verificar a agenda com a equipe e te passo as opções em instantes.'
      }
      break
    case 'buying_signal':
      reply = 'Que ótimo! Para a matrícula, um consultor vai finalizar com você os detalhes. Você prefere fazer isso pessoalmente na unidade ou por aqui mesmo?'
      nextBestAction = 'Ligar agora para fechar matrícula'
      actions.push({ type: 'set_stage', stage: 'negotiation' })
      break
    case 'objection':
      if (c.signals.includes('price_objection')) reply = firstOffer ? `Entendo. Muita gente sente isso no início. Pensando no que você quer resolver, posso te mostrar como fica parcelado (${firstOffer}) e o que está incluso?` : 'Entendo. Pensando no que você quer resolver, faz sentido eu te mostrar o que está incluso antes de falarmos de condições?'
      else if (c.signals.includes('time_objection')) reply = 'Faz sentido. A maioria dos alunos concilia com o trabalho. Qual período costuma ser mais tranquilo pra você?'
      else if (c.signals.includes('spouse_decision')) reply = 'Faz sentido decidir junto. Posso te mandar um resumo pra compartilhar? Vocês podem vir juntos conhecer a escola.'
      else reply = 'Claro. O que te ajudaria a decidir com mais segurança?'
      if (c.signals.includes('later')) actions.push({ type: 'schedule_followup', hours: 72, reason: 'cliente pediu para pensar' })
      nextBestAction = 'Enviar depoimento relacionado à objeção'
      break
    case 'b2b_inquiry':
      reply = 'Legal! Trabalhamos com treinamentos InCompany sob medida. Para quantas pessoas seria e qual o principal objetivo do time?'
      nextBestAction = 'Transferir para especialista B2B'
      break
    default:
      reply = has(text, 'como funciona') ? 'A VOX2you trabalha com prática desde a primeira aula, em turmas pequenas e com feedback individual. Me conta em que situação a comunicação mais te trava hoje?' : 'Entendi. Me conta um pouco mais sobre o que você quer alcançar com a comunicação?'
  }
  return { reply, actions, usedSources: [], confidence: 0.85, nextBestAction }
}
