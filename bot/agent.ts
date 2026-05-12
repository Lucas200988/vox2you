import Anthropic from '@anthropic-ai/sdk'
import { TOOL_DEFINITIONS, executeTool } from './tools'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `Você é a Claudia, assistente inteligente de gestão de estoque da Vox2You. Você opera em um grupo do WhatsApp e ajuda a equipe a registrar vendas, entregas e movimentações de estoque.

## Fluxo de vendas — IMPORTANTE

Existem dois tipos de venda:

**1. Kit do estoque da escola (saleType="escola")**
- O kit físico sai do estoque da escola
- Após lançar, fica como pendente de entrega
- O admin entrega e confirma — o kit sai efetivamente do estoque
- Você PRECISA saber: nome do aluno, curso e quais materiais com quantidade

**2. Aluno compra direto na franqueadora (saleType="franqueadora")**
- O aluno compra o kit pelo site da própria franqueadora
- NÃO movimenta o estoque da escola — só registra a venda para controle
- Você PRECISA saber: nome do aluno e curso (sem materiais)

Sempre pergunte qual dos dois casos é quando lançar uma venda — não assuma.

## Outras regras
- Seja conversacional e objetivo — respostas curtas combinam com WhatsApp
- Pergunte uma coisa por vez quando faltar informação
- Use as ferramentas para registrar tudo no sistema
- Confirme claramente após cada ação
- Consulte o estoque quando perguntarem
- Quando receber uma foto, analise e extraia informações relevantes (nota fiscal, lista de materiais, comprovante)

Fale sempre em português, de forma natural e direta.`

// Sessões de conversa por chat (expira após 15 min de inatividade)
interface Session {
  messages: Anthropic.MessageParam[]
  lastActivity: number
}

const sessions = new Map<string, Session>()
const SESSION_TIMEOUT_MS = 15 * 60 * 1000

function getSession(chatId: string): Session {
  const existing = sessions.get(chatId)
  if (existing && Date.now() - existing.lastActivity < SESSION_TIMEOUT_MS) {
    existing.lastActivity = Date.now()
    return existing
  }
  const fresh: Session = { messages: [], lastActivity: Date.now() }
  sessions.set(chatId, fresh)
  return fresh
}

export async function chat(
  chatId: string,
  userMessage: string,
  botUserId: string,
  imageData?: { base64: string; mimeType: string }
): Promise<string> {
  const session = getSession(chatId)

  if (imageData) {
    const content: Anthropic.MessageParam['content'] = [
      {
        type: 'image',
        source: { type: 'base64', media_type: imageData.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: imageData.base64 },
      },
      ...(userMessage ? [{ type: 'text' as const, text: userMessage }] : [{ type: 'text' as const, text: 'O que você vê nessa imagem? Extraia informações relevantes para o controle de estoque.' }]),
    ]
    session.messages.push({ role: 'user', content })
  } else {
    session.messages.push({ role: 'user', content: userMessage })
  }

  const MAX_ITERATIONS = 8
  let iterations = 0

  while (iterations < MAX_ITERATIONS) {
    iterations++

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOL_DEFINITIONS,
      messages: session.messages,
    })

    session.messages.push({ role: 'assistant', content: response.content })

    // Resposta de texto — Claude quer perguntar algo ou confirmar
    if (response.stop_reason === 'end_turn') {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
      return text
    }

    // Claude quer usar ferramentas
    if (response.stop_reason === 'tool_use') {
      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue

        let result: string
        try {
          result = await executeTool(block.name, block.input as Record<string, unknown>, botUserId)
        } catch (err) {
          result = `Erro ao executar: ${err instanceof Error ? err.message : String(err)}`
        }

        console.log(`🔧 Tool: ${block.name} → ${result}`)

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result,
        })
      }

      session.messages.push({ role: 'user', content: toolResults })
      // Continua o loop para o Claude formular a resposta final
    }
  }

  return '⚠️ Não consegui concluir a operação. Tente novamente.'
}
