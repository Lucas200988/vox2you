import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { conditions: ['development'] },
  test: { name: 'providers', include: ['src/**/*.test.ts'] },
})
