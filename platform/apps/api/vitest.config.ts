import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { conditions: ['development'] },
  test: { name: 'api', include: ['src/**/*.test.ts'], testTimeout: 30000 },
})
