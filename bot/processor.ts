import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type BotIntent =
  | { action: 'launch_sale'; studentName: string; course: string; saleType: 'escola' | 'franqueadora'; items: { materialName: string; quantity: number }[] }
  | { action: 'confirm_delivery'; studentName: string }
  | { action: 'cancel_sale'; studentName: string }
  | { action: 'stock_entry'; materialName: string; quantity: number; notes?: string }
  | { action: 'create_purchase_order'; materialName: string; quantity: number; notes?: string }
  | { action: 'receive_purchase_order'; materialName: string }
  | { action: 'unknown'; reason: string }

const SYSTEM_PROMPT = `Você é um assistente de controle de estoque da Vox2You.
Interprete mensagens em português e retorne SOMENTE um JSON válido, sem texto adicional.

Ações disponíveis:

Lançar venda pela escola:
{"action":"launch_sale","studentName":"nome","course":"curso","saleType":"escola","items":[{"materialName":"nome do material","quantity":2}]}

Lançar venda pela franqueadora:
{"action":"launch_sale","studentName":"nome","course":"curso","saleType":"franqueadora","items":[{"materialName":"nome do material","quantity":2}]}

Confirmar entrega para aluno:
{"action":"confirm_delivery","studentName":"nome"}

Cancelar venda:
{"action":"cancel_sale","studentName":"nome"}

Entrada de estoque (material chegou):
{"action":"stock_entry","materialName":"nome","quantity":5,"notes":"opcional"}

Criar pedido à franqueadora:
{"action":"create_purchase_order","materialName":"nome","quantity":10}

Receber pedido da franqueadora:
{"action":"receive_purchase_order","materialName":"nome"}

Não entendeu a mensagem:
{"action":"unknown","reason":"motivo"}

Exemplos:
"venda pro João Silva, curso técnico, 2 kits básicos" → launch_sale escola
"venda franqueadora pra Maria, técnico, 1 apostila" → launch_sale franqueadora
"entregue pro João" → confirm_delivery
"cancelar venda do João" → cancel_sale
"entrada de 5 kits básicos" → stock_entry
"pedido 10 apostilas pra franqueadora" → create_purchase_order
"chegou pedido de apostilas" → receive_purchase_order`

export async function processMessage(text: string): Promise<BotIntent> {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: text }],
  })

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Resposta inesperada da IA')

  const jsonMatch = content.text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`JSON não encontrado na resposta: ${content.text}`)

  return JSON.parse(jsonMatch[0]) as BotIntent
}
