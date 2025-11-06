import { defineConfig } from 'vitest/config'

const isRules = process.env.RUN_RULES === '1' // solo activamos reglas cuando lo pedimos

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: 'src/__tests__/setup/setupTests.ts',
    globals: true,
    exclude: [
      'e2e/**',                         // Playwright se corre con `pnpm e2e`
      'node_modules/**',
      'dist/**',
      '.next/**',
      'import-clients/node_modules/**', // <— excluye esos tests legacy
      ...(isRules ? [] : ['src/__tests__/rules/**']), // reglas solo cuando RUN_RULES=1
    ],
  },
})