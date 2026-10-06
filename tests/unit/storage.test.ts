import { describe, expect, it } from 'vitest'
import { backupPolicyFor } from '../../src/main/file/session'
import { setSetting } from '../../src/main/repos/settings'
import { createDemoDatabase } from '../../src/main/demo/demoSchool'
import { testContext } from './helpers'

describe('backup rules from the file (SPEC.md 7 item 13)', () => {
  it('uses the usual rules until the school changes them', async () => {
    const ctx = testContext()
    const db = await createDemoDatabase(ctx, '0.9.0')
    expect(backupPolicyFor(db)).toEqual({
      keepAllDays: 7,
      dailyDays: 92,
      maxBytes: 500 * 1024 * 1024
    })
    setSetting(db, ctx, 'storage.backupRules', { keepAllDays: 14, dailyDays: 365, maxMb: 1000 })
    expect(backupPolicyFor(db)).toEqual({
      keepAllDays: 14,
      dailyDays: 365,
      maxBytes: 1000 * 1024 * 1024
    })
    // A damaged value falls back to the usual rules rather than breaking backups.
    setSetting(db, ctx, 'storage.backupRules', { keepAllDays: 0 })
    expect(backupPolicyFor(db).keepAllDays).toBe(7)
  })
})
