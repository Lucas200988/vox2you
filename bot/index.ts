import { Client, LocalAuth } from 'whatsapp-web.js'
import qrcode from 'qrcode-terminal'
import cron from 'node-cron'
import { chat } from './agent'
import { sendWeeklyReport } from './report'
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
  console.log(`✅ Claudia pronta — monitorando ${scope}`)

  // Relatório semanal toda segunda-feira às 8h (horário de Brasília)
  cron.schedule('0 8 * * 1', async () => {
    if (!WHATSAPP_GROUP_ID) {
      console.log('⚠️ WHATSAPP_GROUP_ID não configurado — relatório semanal não enviado')
      return
    }
    await sendWeeklyReport(client, WHATSAPP_GROUP_ID)
  }, { timezone: 'America/Sao_Paulo' })

  console.log('📅 Relatório semanal agendado para segunda-feira às 8h (Brasília)')
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
  const hasImage = msg.hasMedia && ['image'].includes(msg.type)

  if (!text && !hasImage) return

  const contact = await msg.getContact()
  console.log(`📨 [${new Date().toLocaleTimeString()}] ${contact.pushname}: "${text || '[imagem]'}"`)

  // Comando on-demand para relatório semanal
  if (text.toLowerCase() === '/relatorio') {
    if (!WHATSAPP_GROUP_ID) {
      await msg.reply('⚠️ WHATSAPP_GROUP_ID não configurado.')
      return
    }
    await sendWeeklyReport(client, WHATSAPP_GROUP_ID)
    return
  }

  try {
    let imageData: { base64: string; mimeType: string } | undefined

    if (hasImage) {
      const media = await msg.downloadMedia()
      if (media?.data && media?.mimetype) {
        imageData = { base64: media.data, mimeType: media.mimetype.split(';')[0] }
        console.log(`🖼️ Imagem recebida: ${imageData.mimeType}`)
      }
    }

    const reply = await chat(msg.from, text, BOT_USER_ID!, imageData)
    await msg.reply(reply)
  } catch (err) {
    console.error('❌ Erro:', err instanceof Error ? err.message : err)
    await msg.reply('❌ Ocorreu um erro. Tente novamente em instantes.')
  }
})

client.initialize()
