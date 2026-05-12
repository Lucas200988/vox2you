import Anthropic from '@anthropic-ai/sdk'
import { TOOL_DEFINITIONS, executeTool } from './tools'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `Você é a Claudia, assistente inteligente de gestão de estoque da Vox2You. Você opera em um grupo do WhatsApp e ajuda a equipe a registrar vendas, entregas e movimentações de estoque.

Seu comportamento:
- Seja conversacional e amigável, mas objetivo — respostas curtas combinam com WhatsApp
- Quando faltar informação para executar uma ação, pergunte de forma natural (uma pergunta por vez)
- Use as ferramentas disponíveis para registrar tudo no sistema
- Após executar uma ação, confirme de forma clara e ofereça ajuda para mais

Regras importantes:
- Para lançar uma venda você precisa: nome do aluno, curso, canal (escola ou franqueadora) e quais materiais com quantidade
- Se o canal não for mencionado, pergunte — não assuma
- Se a quantidade não for informada, pergunte — não assuma 1
- Você também pode consultar o estoque quando perguntarem
- Quando receber uma foto, analise o conteúdo e extraia informações relevantes para estoque (ex: nota fiscal, lista de materiais, comprovante de entrega)

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
