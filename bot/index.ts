import { Client, LocalAuth } from 'whatsapp-web.js'
import qrcode from 'qrcode-terminal'
import { processMessage } from './processor'
import { handleIntent } from './handler'
import * as dotenv from 'dotenv'

dotenv.config()

const BOT_USER_ID = process.env.BOT_USER_ID
const WHATSAPP_GROUP_ID = process.env.WHATSAPP_GROUP_ID

if (!BOT_USER_ID) {
  console.error('❌ BOT_USER_ID não configurado no .env')
  process.exit(1)
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY não configurado no .env')
  process.exit(1)
}

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] },
})

client.on('qr', (qr) => {
  console.log('\n📱 Escaneie o QR Code com seu WhatsApp:\n')
  qrcode.generate(qr, { small: true })
})

client.on('authenticated', () => {
  console.log('🔐 Autenticado!')
})

client.on('ready', () => {
  const groupInfo = WHATSAPP_GROUP_ID ? ` (grupo: ${WHATSAPP_GROUP_ID})` : ' (todos os grupos)'
  console.log(`✅ Bot WhatsApp pronto${groupInfo}`)
})

client.on('disconnected', (reason) => {
  console.log('⚠️  Bot desconectado:', reason)
})

client.on('message', async (msg) => {
  if (msg.fromMe) return

  const chat = await msg.getChat()
  if (!chat.isGroup) return

  if (WHATSAPP_GROUP_ID && msg.from !== WHATSAPP_GROUP_ID) return

  const text = msg.body.trim()
  if (!text) return

  const contact = await msg.getContact()
  console.log(`📨 [${new Date().toLocaleTimeString()}] ${contact.pushname}: "${text}"`)

  try {
    const intent = await processMessage(text)
    console.log(`🧠 Intenção: ${intent.action}`)

    const response = await handleIntent(intent, BOT_USER_ID)
    await msg.reply(response)
  } catch (err) {
    console.error('❌ Erro:', err instanceof Error ? err.message : err)
    await msg.reply('❌ Erro ao processar o comando. Tente novamente.')
  }
})

client.initialize()
