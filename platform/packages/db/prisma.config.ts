import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'pnpm --filter @vox/api seed',
  },
  datasource: {
    url: process.env['DATABASE_URL'] ?? 'postgresql://vox:vox@localhost:5432/vox',
  },
})
