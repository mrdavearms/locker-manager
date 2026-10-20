import { defineConfig } from 'vitest/config'

// Tests that start a real Electron main process (tests/electron). Kept out of
// `npm test` because Electron needs a display on Linux; CI runs them on Windows
// and Mac with `npm run test:electron`.
export default defineConfig({
  test: {
    include: ['tests/electron/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000
  }
})
