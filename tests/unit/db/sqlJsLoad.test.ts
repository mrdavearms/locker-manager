import { afterEach, describe, expect, it, vi } from 'vitest'

// docs/audits/2026-10-20-stability-audit.md, start-up finding F10: a database
// engine that failed to load once used to fail every file for the whole session.

afterEach(() => {
  vi.doUnmock('sql.js')
  vi.resetModules()
})

describe('loading the database engine', () => {
  it('tries again after a failed load', async () => {
    let calls = 0
    vi.doMock('sql.js', async (importOriginal) => {
      const real = await importOriginal<typeof import('sql.js')>()
      return {
        default: () => {
          calls++
          return calls === 1 ? Promise.reject(new Error('wasm missing')) : real.default()
        }
      }
    })
    const { loadSqlJs } = await import('../../../src/main/db/db')
    await expect(loadSqlJs()).rejects.toThrow('wasm missing')
    await expect(loadSqlJs()).resolves.toBeDefined()
    expect(calls).toBe(2)
  })
})
