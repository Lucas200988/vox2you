const WAHA_URL = process.env.WAHA_BASE_URL || 'http://localhost:3001'
const WAHA_API_KEY = process.env.WAHA_API_KEY!
const WAHA_SESSION = process.env.WAHA_SESSION || 'default'

export async function sendGroupMessage(groupId: string, text: string) {
  const res = await fetch(`${WAHA_URL}/api/sendText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': WAHA_API_KEY,
    },
    body: JSON.stringify({
      session: WAHA_SESSION,
      chatId: groupId,
      text,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[WhatsApp] Erro ao enviar mensagem:', err)
    throw new Error(`Falha ao enviar mensagem: ${err}`)
  }

  return res.json()
}
