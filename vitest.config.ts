import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@shared': resolve('src/shared') } },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/crash/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    // Windows CI runners are several times slower at file operations.
    testTimeout: process.env.CI ? 30_000 : 10_000,
    coverage: { provider: 'v8', include: ['src/main/**', 'src/shared/**'] }
  }
})
