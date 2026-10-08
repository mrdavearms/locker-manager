import { describe, expect, it } from 'vitest'
import { backupPolicyFor } from '../../src/main/file/session'
import { setSetting } from '../../src/main/repos/settings'
import { createDemoDatabase } from '../../src/main/demo/demoSchool'
import { BackupRulesSchema, fullBackupRules } from '../../src/shared/storage'
import { testContext } from './helpers'

describe('backup rules from the file (SPEC.md 7 item 13)', () => {
  it('uses the usual rules until the school changes them', async () => {
    const ctx = testContext()
    const db = await createDemoDatabase(ctx, '0.9.0')
    expect(backupPolicyFor(db)).toEqual({
      keepAllDays: 1,
      hourlyDays: 7,
      dailyDays: 99,
      maxBytes: 500 * 1024 * 1024
    })
    setSetting(db, ctx, 'storage.backupRules', {
      keepAllDays: 2,
      hourlyDays: 14,
      dailyDays: 365,
      maxMb: 1000
    })
    expect(backupPolicyFor(db)).toEqual({
      keepAllDays: 2,
      hourlyDays: 14,
      dailyDays: 365,
      maxBytes: 1000 * 1024 * 1024
    })
    // A damaged value falls back to the usual rules rather than breaking backups.
    setSetting(db, ctx, 'storage.backupRules', { keepAllDays: 0 })
    expect(backupPolicyFor(db).keepAllDays).toBe(1)
  })

  it('reads rules saved by an older version, which had no hourly stage', async () => {
    const ctx = testContext()
    const db = await createDemoDatabase(ctx, '0.9.0')
    setSetting(db, ctx, 'storage.backupRules', { keepAllDays: 14, dailyDays: 365, maxMb: 1000 })
    expect(backupPolicyFor(db)).toEqual({
      keepAllDays: 14,
      hourlyDays: 14,
      dailyDays: 365,
      maxBytes: 1000 * 1024 * 1024
    })
    expect(fullBackupRules({ keepAllDays: 14, dailyDays: 365, maxMb: 1000 })).toEqual({
      keepAllDays: 14,
      hourlyDays: 14,
      dailyDays: 365,
      maxMb: 1000
    })
  })

  it('stays readable by an older version, which ignores the new hourly setting', () => {
    const older = BackupRulesSchema.omit({ hourlyDays: true })
    expect(older.parse({ keepAllDays: 1, hourlyDays: 7, dailyDays: 99, maxMb: 500 })).toEqual({
      keepAllDays: 1,
      dailyDays: 99,
      maxMb: 500
    })
  })
})
