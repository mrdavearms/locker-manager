import { resolve } from 'node:path'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@shared': resolve('src/shared') } },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/crash/**/*.test.ts', 'src/**/*.test.ts'],
    // The registration service runs its own tests (npm test --prefix registration-service).
    exclude: [...configDefaults.exclude, 'registration-service/**'],
    environment: 'node',
    // Windows CI runners are several times slower at file operations.
    testTimeout: process.env.CI ? 30_000 : 10_000,
    coverage: { provider: 'v8', include: ['src/main/**', 'src/shared/**'] }
  }
})
