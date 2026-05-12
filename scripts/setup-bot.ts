/**
 * Cria o usuário "Claudia Bot" no banco e imprime o BOT_USER_ID.
 * Uso: npx tsx scripts/setup-bot.ts
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as dotenv from 'dotenv'

dotenv.config()

const required = ['DATABASE_URL', 'DIRECT_URL']
const missing = required.filter((k) => !process.env[k])
if (missing.length) {
  console.error(`❌ Variáveis de ambiente faltando: ${missing.join(', ')}`)
  console.error('   Preencha o arquivo .env antes de rodar este script.')
  process.exit(1)
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🔍 Verificando usuário bot...')

  const existing = await prisma.user.findFirst({
    where: { email: 'bot@vox2you.com' },
  })

  if (existing) {
    console.log(`✅ Usuário bot já existe.`)
    console.log(`\nAdicione ao .env:\nBOT_USER_ID="${existing.id}"`)
    return
  }

  const bot = await prisma.user.create({
    data: {
      email: 'bot@vox2you.com',
      name: 'Claudia Bot',
      role: 'administrador',
    },
  })

  console.log(`✅ Usuário bot criado com sucesso!`)
  console.log(`\nAdicione ao .env:\nBOT_USER_ID="${bot.id}"`)
}

main()
  .catch((e) => { console.error('❌', e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
