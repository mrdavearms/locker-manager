import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  backupFileName,
  DEFAULT_POLICY,
  listBackups,
  parseBackupName,
  planPrune,
  sharedBackupDir,
  writeBackup,
  type BackupEntry
} from '../../../src/main/file/backups'
import { nodeFs } from '../../../src/main/file/fsPort'
import { tempDir } from './tmp'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
let n = 0
const suffix = (): string => `b${++n}`

describe('backup names', () => {
  it('round-trip the time and label', () => {
    const at = new Date(2026, 9, 6, 9, 15, 12)
    const name = backupFileName('Locker data', at, 'before update to 1.4.0')
    expect(name).toBe('Locker data 2026-10-06 091512 before update to 1.4.0.lockers')
    expect(parseBackupName('Locker data', name)).toEqual({ at, label: 'before update to 1.4.0' })
    expect(parseBackupName('Locker data', backupFileName('Locker data', at))).toEqual({
      at,
      label: null
    })
  })
  it('strip characters Windows forbids in labels', () => {
    expect(backupFileName('X', new Date(2026, 0, 1), 'a/b:c*d?')).toBe(
      'X 2026-01-01 000000 a-b-c-d-.lockers'
    )
  })
  it('ignore files that are not backups of this file', () => {
    expect(parseBackupName('Locker data', 'Other 2026-10-06 091512.lockers')).toBeNull()
    expect(parseBackupName('Locker data', 'Locker data notes.txt')).toBeNull()
  })
  it('live beside the data file', () => {
    expect(sharedBackupDir('/share/Lockers/Locker data.lockers')).toBe(
      join('/share/Lockers', 'Locker Manager backups', 'Locker data')
    )
  })
})

describe('planPrune (SPEC.md 6.5)', () => {
  const now = new Date(2026, 9, 6, 12, 0, 0)
  function hourly(days: number, size = 1000): BackupEntry[] {
    const out: BackupEntry[] = []
    for (let h = 0; h < days * 24; h++) {
      const at = new Date(now.getTime() - h * HOUR - 1000)
      out.push({ name: `b${h}`, at, label: null, size })
    }
    return out
  }

  it('keeps all of the last 7 days, one a day to 3 months, then one a week', () => {
    const entries = hourly(180)
    const doomed = new Set(planPrune(entries, now))
    const kept = entries.filter((e) => !doomed.has(e.name))
    const age = (e: BackupEntry): number => (now.getTime() - e.at.getTime()) / DAY
    expect(kept.filter((e) => age(e) < 7)).toHaveLength(7 * 24)
    const daily = kept.filter((e) => age(e) >= 7 && age(e) < 92)
    expect(daily.length).toBeGreaterThanOrEqual(84)
    expect(daily.length).toBeLessThanOrEqual(86)
    const weekly = kept.filter((e) => age(e) >= 92)
    expect(weekly.length).toBeGreaterThanOrEqual(12)
    expect(weekly.length).toBeLessThanOrEqual(14)
  })

  it('never prunes a named backup for age', () => {
    const old: BackupEntry = {
      name: 'named',
      at: new Date(now.getTime() - 400 * DAY),
      label: 'before update to 1.4.0',
      size: 10
    }
    expect(planPrune([old, ...hourly(1)], now)).not.toContain('named')
  })

  it('obeys the size cap, oldest unnamed first, and never deletes the newest', () => {
    const entries = hourly(3, 100)
    const doomed = planPrune(entries, now, { ...DEFAULT_POLICY, maxBytes: 1000 })
    const kept = entries.filter((e) => !doomed.includes(e.name))
    expect(kept.reduce((s, e) => s + e.size, 0)).toBeLessThanOrEqual(1000)
    expect(kept.map((e) => e.name)).toContain('b0')
    expect(Math.max(...kept.map((e) => Number(e.name.slice(1))))).toBeLessThan(10)
  })

  it('over the cap, thins a busy day before touching older history', () => {
    // A save every 2 minutes for the last 8 hours, plus one backup a day for 60 days.
    const busy: BackupEntry[] = []
    for (let i = 0; i < 240; i++)
      busy.push({
        name: `busy${i}`,
        at: new Date(now.getTime() - i * 2 * 60 * 1000 - 1000),
        label: null,
        size: 100
      })
    const history: BackupEntry[] = []
    for (let d = 8; d < 68; d++)
      history.push({
        name: `day${d}`,
        at: new Date(now.getTime() - d * DAY),
        label: null,
        size: 100
      })
    const doomed = new Set(
      planPrune([...busy, ...history], now, { ...DEFAULT_POLICY, maxBytes: 100 * 140 })
    )
    expect(history.filter((e) => doomed.has(e.name))).toEqual([])
    const keptBusy = busy.filter((e) => !doomed.has(e.name))
    expect(keptBusy.length).toBeLessThan(busy.length)
    // The last hour is untouched.
    expect(busy.slice(0, 29).every((e) => !doomed.has(e.name))).toBe(true)
  })

  it('keeps the newest backup even when it alone is over the cap', () => {
    const big: BackupEntry = {
      name: 'big',
      at: new Date(now.getTime() - 1000),
      label: null,
      size: 10_000
    }
    expect(planPrune([big], now, { ...DEFAULT_POLICY, maxBytes: 1 })).toEqual([])
  })
})

describe('writeBackup', () => {
  it('writes, never overwrites, and lists newest first', async () => {
    const dir = join(tempDir(), 'Locker Manager backups', 'Locker data')
    const at = new Date(2026, 9, 6, 9, 0, 0)
    const a = await writeBackup(nodeFs, dir, 'Locker data', new Uint8Array([1]), at, {
      randomSuffix: suffix
    })
    const b = await writeBackup(nodeFs, dir, 'Locker data', new Uint8Array([2]), at, {
      randomSuffix: suffix
    })
    expect(a).not.toBe(b)
    const listed = await listBackups(nodeFs, dir, 'Locker data')
    expect(listed).toHaveLength(2)
    expect(readdirSync(dir).filter((f) => f.includes('.tmp-'))).toEqual([])
  })
  it('lists nothing when the folder does not exist yet', async () => {
    expect(await listBackups(nodeFs, join(tempDir(), 'none'), 'Locker data')).toEqual([])
  })
})
