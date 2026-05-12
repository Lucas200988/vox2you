import { Client, LocalAuth } from 'whatsapp-web.js'
import qrcode from 'qrcode-terminal'
import { chat } from './agent'
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
  const scope = WHATSAPP_GROUP_ID ? `grupo ${WHATSAPP_GROUP_ID}` : 'todos os grupos'
  console.log(`✅ Vivi pronta — monitorando ${scope}`)
})

client.on('disconnected', (reason) => {
  console.log('⚠️  Desconectado:', reason)
})

client.on('message', async (msg) => {
  if (msg.fromMe) return

  const chat_ = await msg.getChat()
  if (!chat_.isGroup) return

  if (WHATSAPP_GROUP_ID && msg.from !== WHATSAPP_GROUP_ID) return

  const text = msg.body.trim()
  if (!text) return

  const contact = await msg.getContact()
  console.log(`📨 [${new Date().toLocaleTimeString()}] ${contact.pushname}: "${text}"`)

  try {
    // Usa o id do chat como chave da sessão (cada grupo tem seu contexto)
    const reply = await chat(msg.from, text, BOT_USER_ID)
    await msg.reply(reply)
  } catch (err) {
    console.error('❌ Erro:', err instanceof Error ? err.message : err)
    await msg.reply('❌ Ocorreu um erro. Tente novamente em instantes.')
  }
})

client.initialize()
