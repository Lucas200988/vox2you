import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { conditions: ['development'] },
  test: {
    projects: [
      'packages/shared',
      'packages/core',
      'packages/providers',
      'packages/db',
      'apps/api',
      'apps/worker',
      'tests/integration',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**', 'apps/*/src/**'],
      exclude: ['packages/db/src/generated/**'],
    },
  },
})
