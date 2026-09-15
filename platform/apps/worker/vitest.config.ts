import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { conditions: ['development'] },
  test: { name: 'worker', include: ['src/**/*.test.ts'] },
})
