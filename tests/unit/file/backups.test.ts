import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { createNewDatabase } from '../../../src/main/db/newFile'
import {
  backupFileName,
  backupReach,
  compressBackup,
  DEFAULT_POLICY,
  listBackups,
  parseBackupName,
  planPrune,
  readBackupFile,
  sharedBackupDir,
  writeBackup,
  type BackupEntry,
  type BackupPolicy
} from '../../../src/main/file/backups'
import { nodeFs } from '../../../src/main/file/fsPort'
import { sha256 } from '../../../src/main/file/hash'
import { testContext } from '../helpers'
import { faultyFs } from './faultyFs'
import { tempDir } from './tmp'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
let n = 0
const suffix = (): string => `b${++n}`

async function realFileBytes(): Promise<Uint8Array> {
  const db = await createNewDatabase(testContext(), {
    schoolName: 'SYNTHETIC School',
    appVersion: '0.1.0'
  })
  const bytes = db.export()
  db.close()
  return bytes
}

describe('backup names', () => {
  it('round-trip the time and label', () => {
    const at = new Date(2026, 9, 6, 9, 15, 12)
    const name = backupFileName('Locker data', at, 'before update to 1.4.0')
    expect(name).toBe('Locker data 2026-10-06 091512 before update to 1.4.0.lockers.gz')
    expect(parseBackupName('Locker data', name)).toEqual({ at, label: 'before update to 1.4.0' })
    expect(parseBackupName('Locker data', backupFileName('Locker data', at))).toEqual({
      at,
      label: null
    })
  })
  it('still read the names of older, uncompressed backups', () => {
    const at = new Date(2026, 9, 6, 9, 15, 12)
    expect(backupFileName('Locker data', at, undefined, { compressed: false })).toBe(
      'Locker data 2026-10-06 091512.lockers'
    )
    expect(parseBackupName('Locker data', 'Locker data 2026-10-06 091512 named.lockers')).toEqual({
      at,
      label: 'named'
    })
  })
  it('strip characters Windows forbids in labels', () => {
    expect(backupFileName('X', new Date(2026, 0, 1), 'a/b:c*d?')).toBe(
      'X 2026-01-01 000000 a-b-c-d-.lockers.gz'
    )
  })
  it('ignore files that are not backups of this file', () => {
    expect(parseBackupName('Locker data', 'Other 2026-10-06 091512.lockers')).toBeNull()
    expect(parseBackupName('Locker data', 'Other 2026-10-06 091512.lockers.gz')).toBeNull()
    expect(parseBackupName('Locker data', 'Locker data notes.txt')).toBeNull()
    expect(parseBackupName('Locker data', 'Locker data 2026-10-06 091512.gz')).toBeNull()
  })
  it('live beside the data file', () => {
    expect(sharedBackupDir('/share/Lockers/Locker data.lockers')).toBe(
      join('/share/Lockers', 'Locker Manager backups', 'Locker data')
    )
  })
})

describe('planPrune (SPEC.md 6.5)', () => {
  const now = new Date(2026, 9, 6, 12, 0, 0)
  const age = (e: BackupEntry): number => (now.getTime() - e.at.getTime()) / DAY
  function every(stepMs: number, days: number, size = 1000): BackupEntry[] {
    const out: BackupEntry[] = []
    for (let t = 1000; t < days * DAY; t += stepMs) {
      out.push({ name: `b${t}`, at: new Date(now.getTime() - t), label: null, size })
    }
    return out
  }

  it('uses the usual rules: every save for a day, hourly to a week, daily to 99 days', () => {
    expect(DEFAULT_POLICY).toEqual({
      keepAllDays: 1,
      hourlyDays: 7,
      dailyDays: 99,
      maxBytes: 500 * 1024 * 1024
    })
  })

  it('keeps every save for a day, one an hour to 7 days, one a day to 99, then one a week', () => {
    const entries = every(10 * MINUTE, 160)
    const doomed = new Set(planPrune(entries, now))
    const kept = entries.filter((e) => !doomed.has(e.name))
    expect(kept.filter((e) => age(e) < 1)).toHaveLength(6 * 24)
    expect(kept.filter((e) => age(e) >= 1 && age(e) < 7)).toHaveLength(6 * 24)
    const daily = kept.filter((e) => age(e) >= 7 && age(e) < 99)
    expect(daily.length).toBeGreaterThanOrEqual(91)
    expect(daily.length).toBeLessThanOrEqual(93)
    const weekly = kept.filter((e) => age(e) >= 99)
    expect(weekly.length).toBeGreaterThanOrEqual(8)
    expect(weekly.length).toBeLessThanOrEqual(10)
  })

  it('reads older rules with no hourly stage (hourlyDays equal to keepAllDays)', () => {
    const entries = every(HOUR, 30)
    const doomed = new Set(
      planPrune(entries, now, { keepAllDays: 7, hourlyDays: 7, dailyDays: 92, maxBytes: 1e12 })
    )
    const kept = entries.filter((e) => !doomed.has(e.name))
    expect(kept.filter((e) => age(e) < 7)).toHaveLength(7 * 24)
    const older = kept.filter((e) => age(e) >= 7)
    expect(older.length).toBeGreaterThanOrEqual(22)
    expect(older.length).toBeLessThanOrEqual(24)
  })

  it('never prunes a named backup for age', () => {
    const old: BackupEntry = {
      name: 'named',
      at: new Date(now.getTime() - 400 * DAY),
      label: 'before update to 1.4.0',
      size: 10
    }
    expect(planPrune([old, ...every(HOUR, 1)], now)).not.toContain('named')
  })

  it('obeys the size cap, oldest unnamed first, and never deletes the newest', () => {
    const entries = every(HOUR, 3, 100)
    const doomed = planPrune(entries, now, { ...DEFAULT_POLICY, maxBytes: 1000 })
    const kept = entries.filter((e) => !doomed.includes(e.name))
    expect(kept.reduce((s, e) => s + e.size, 0)).toBeLessThanOrEqual(1000)
    expect(kept.map((e) => e.name)).toContain(entries[0]!.name)
    expect(Math.max(...kept.map((e) => now.getTime() - e.at.getTime()))).toBeLessThan(10 * HOUR)
  })

  it('over the cap, drops weekly backups older than the promise before anything promised', () => {
    const recent = every(HOUR, 7, 100)
    const weekly: BackupEntry[] = []
    for (let w = 15; w < 40; w++)
      weekly.push({
        name: `week${w}`,
        at: new Date(now.getTime() - w * 7 * DAY),
        label: null,
        size: 100
      })
    const kept = (recent.length + 10) * 100
    const doomed = new Set(
      planPrune([...recent, ...weekly], now, { ...DEFAULT_POLICY, maxBytes: kept })
    )
    expect(recent.filter((e) => doomed.has(e.name))).toEqual([])
    expect(weekly.filter((e) => doomed.has(e.name))).toHaveLength(weekly.length - 10)
    // The oldest go first.
    expect(doomed.has('week39')).toBe(true)
    expect(doomed.has('week15')).toBe(false)
  })

  it('over the cap, thins a busy day before touching older history', () => {
    // A save every 2 minutes for the last 8 hours, plus one backup a day for 60 days.
    const busy = every(2 * MINUTE, 8 / 24, 100)
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

  it('over the cap, thins the hourly backups before giving up any day', () => {
    // A save every 30 minutes for 99 days: 48 in the last day, 144 hourly, 92 daily.
    const entries = every(30 * MINUTE, 99, 100)
    const doomed = new Set(planPrune(entries, now, { ...DEFAULT_POLICY, maxBytes: 150 * 100 }))
    const kept = entries.filter((e) => !doomed.has(e.name))
    expect(kept.length).toBeLessThanOrEqual(150)
    // Every daily backup is still there, so the school can go back any day.
    const daily = kept.filter((e) => age(e) >= 7)
    expect(daily.length).toBeGreaterThanOrEqual(91)
    expect(Math.max(...kept.map(age))).toBeGreaterThan(98)
    // The last day is untouched; the hourly week is thinned.
    expect(kept.filter((e) => age(e) < 1)).toHaveLength(48)
    expect(kept.filter((e) => age(e) >= 1 && age(e) < 7).length).toBeLessThan(144)
  })

  it('over a tight cap, spreads the daily backups out rather than losing the oldest weeks', () => {
    const entries = every(30 * MINUTE, 99, 100)
    const doomed = new Set(planPrune(entries, now, { ...DEFAULT_POLICY, maxBytes: 100 * 100 }))
    const kept = entries.filter((e) => !doomed.has(e.name))
    expect(kept.length).toBeLessThanOrEqual(100)
    expect(Math.max(...kept.map(age))).toBeGreaterThan(95)
    // No gap of more than about two days anywhere in the 99 days.
    const ages = kept.map(age).sort((a, b) => a - b)
    for (let i = 1; i < ages.length; i++) expect(ages[i]! - ages[i - 1]!).toBeLessThan(2.5)
    // The last hour is still whole.
    expect(entries.slice(0, 2).every((e) => !doomed.has(e.name))).toBe(true)
  })

  it('deletes named backups only after every other one but the newest has gone', () => {
    const named: BackupEntry = {
      name: 'named',
      at: new Date(now.getTime() - 50 * DAY),
      label: 'before starting 2027',
      size: 100
    }
    const entries = [...every(HOUR, 2, 100), named]
    const doomed = new Set(planPrune(entries, now, { ...DEFAULT_POLICY, maxBytes: 150 }))
    expect(doomed.has('named')).toBe(true)
    expect(doomed.has(entries[0]!.name)).toBe(false)
    const doomed2 = new Set(planPrune(entries, now, { ...DEFAULT_POLICY, maxBytes: 200 }))
    expect(doomed2.has('named')).toBe(false)
    expect(entries.length - doomed2.size).toBe(2)
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

  // The schedule is applied after every save, so it must hold up when run again and
  // again as backups age: the newest save of each hour (then of each day) survives.
  it('keeps its promise when pruned after every save (property test)', () => {
    const policy: BackupPolicy = { ...DEFAULT_POLICY, maxBytes: Number.MAX_SAFE_INTEGER }
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 40 * 24 * 60 }), { minLength: 1, maxLength: 120 }),
        fc.array(fc.boolean(), { minLength: 120, maxLength: 120 }),
        (gapsMinutes, named) => {
          const start = new Date(2026, 6, 1, 8, 0, 0).getTime()
          let t = start
          const saves: BackupEntry[] = []
          let folder: BackupEntry[] = []
          gapsMinutes.forEach((gap, i) => {
            t += gap * MINUTE
            const e: BackupEntry = {
              name: `s${i}`,
              at: new Date(t),
              label: named[i] && i % 7 === 0 ? 'named' : null,
              size: 1
            }
            saves.push(e)
            folder.push(e)
            const doomed = new Set(planPrune(folder, new Date(t), policy))
            folder = folder.filter((x) => !doomed.has(x.name))
          })
          const at = new Date(t)
          const keptNames = new Set(folder.map((e) => e.name))
          const ageOf = (e: BackupEntry): number => at.getTime() - e.at.getTime()
          // Every named backup, every save of the last day and the newest are kept.
          for (const e of saves) {
            if (e.label !== null || ageOf(e) < policy.keepAllDays * DAY)
              expect(keptNames.has(e.name)).toBe(true)
          }
          expect(keptNames.has(saves[saves.length - 1]!.name)).toBe(true)
          // In each local hour lying wholly inside the hourly stretch, the newest
          // unnamed save is kept, and only that one; the same for each local day in
          // the daily stretch.
          const byBucket = (
            fromAge: number,
            toAge: number,
            span: (d: Date) => [Date, Date]
          ): Map<string, BackupEntry[]> => {
            const m = new Map<string, BackupEntry[]>()
            for (const e of saves) {
              if (e.label !== null) continue
              const [a, b] = span(e.at)
              const inside =
                at.getTime() - b.getTime() >= fromAge && at.getTime() - a.getTime() < toAge
              if (!inside) continue
              const k = a.toISOString()
              m.set(k, [...(m.get(k) ?? []), e])
            }
            return m
          }
          const hourSpan = (d: Date): [Date, Date] => {
            const a = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours())
            return [a, new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1)]
          }
          const daySpan = (d: Date): [Date, Date] => [
            new Date(d.getFullYear(), d.getMonth(), d.getDate()),
            new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
          ]
          const hours = byBucket(policy.keepAllDays * DAY, policy.hourlyDays * DAY, hourSpan)
          for (const group of hours.values()) {
            const newest = group.reduce((a, b) => (a.at > b.at ? a : b))
            expect(keptNames.has(newest.name)).toBe(true)
            expect(group.filter((e) => keptNames.has(e.name)).length).toBe(1)
          }
          const days = byBucket(policy.hourlyDays * DAY, policy.dailyDays * DAY, daySpan)
          for (const group of days.values()) {
            const newest = group.reduce((a, b) => (a.at > b.at ? a : b))
            expect(keptNames.has(newest.name)).toBe(true)
            expect(group.filter((e) => keptNames.has(e.name)).length).toBe(1)
          }
        }
      ),
      { numRuns: 150 }
    )
  })

  it('never goes over the cap unless only the newest is left (property test)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            ageMinutes: fc.integer({ min: 0, max: 200 * 24 * 60 }),
            size: fc.integer({ min: 1, max: 50 }),
            named: fc.boolean()
          }),
          { minLength: 1, maxLength: 80 }
        ),
        fc.integer({ min: 1, max: 1500 }),
        (raw, maxBytes) => {
          const entries: BackupEntry[] = raw.map((r, i) => ({
            name: `e${i}`,
            at: new Date(now.getTime() - r.ageMinutes * MINUTE - i),
            label: r.named ? 'named' : null,
            size: r.size
          }))
          const doomed = new Set(planPrune(entries, now, { ...DEFAULT_POLICY, maxBytes }))
          const kept = entries.filter((e) => !doomed.has(e.name))
          const newest = entries.reduce((a, b) => (a.at > b.at ? a : b))
          expect(kept).toContain(newest)
          const total = kept.reduce((s, e) => s + e.size, 0)
          if (kept.length > 1) expect(total).toBeLessThanOrEqual(maxBytes)
          // A named backup goes only once every unnamed one but the newest has gone.
          if (entries.some((e) => e.label !== null && doomed.has(e.name)))
            expect(kept.filter((e) => e.label === null && e !== newest)).toEqual([])
        }
      ),
      { numRuns: 300 }
    )
  })
})

describe('backupReach (Settings, Storage)', () => {
  const now = new Date(2026, 9, 6, 12, 0, 0)
  const entry = (ageDays: number, size: number, label: string | null = null): BackupEntry => ({
    name: `a${ageDays}-${label ?? ''}`,
    at: new Date(now.getTime() - ageDays * DAY),
    label,
    size
  })

  it('reports no backups yet', () => {
    expect(backupReach([], now, DEFAULT_POLICY)).toEqual({
      oldest: null,
      promisedDays: 99,
      short: false,
      full: false
    })
  })

  it('is not short when the folder has room, however young the backups are', () => {
    const r = backupReach([entry(0.1, 10), entry(2, 10)], now, DEFAULT_POLICY)
    expect(r).toEqual({
      oldest: new Date(now.getTime() - 2 * DAY),
      promisedDays: 99,
      short: false,
      full: false
    })
  })

  it('is short when the folder is full and the oldest everyday backup is too young', () => {
    const policy = { ...DEFAULT_POLICY, maxBytes: 100 }
    const r = backupReach([entry(0.1, 30), entry(1, 30), entry(3, 30)], now, policy)
    expect(r.short).toBe(true)
    expect(r.oldest).toEqual(new Date(now.getTime() - 3 * DAY))
  })

  it('looks past old named backups, which do not cover everyday changes', () => {
    const policy = { ...DEFAULT_POLICY, maxBytes: 100 }
    const r = backupReach(
      [entry(0.1, 30), entry(3, 30), entry(300, 30, 'before starting 2026')],
      now,
      policy
    )
    expect(r.short).toBe(true)
    expect(r.oldest).toEqual(new Date(now.getTime() - 3 * DAY))
  })

  it('is not short once the backups reach back as far as promised', () => {
    const policy = { ...DEFAULT_POLICY, maxBytes: 100 }
    expect(backupReach([entry(0.1, 30), entry(99.5, 60)], now, policy).short).toBe(false)
  })

  it('says a full folder is full even when it still reaches back far enough', () => {
    const policy = { ...DEFAULT_POLICY, maxBytes: 100 }
    const r = backupReach([entry(0.1, 30), entry(99.5, 60)], now, policy)
    expect(r.full).toBe(true)
    expect(backupReach([entry(0.1, 10)], now, policy).full).toBe(false)
  })
})

describe('compressed backups', () => {
  it('compress a real data file and read it back exactly', async () => {
    const bytes = await realFileBytes()
    const gz = await compressBackup(bytes)
    expect(gz.byteLength).toBeLessThan(bytes.byteLength)
    expect(sha256(new Uint8Array(gunzipSync(gz)))).toBe(sha256(bytes))
  })

  it('compress a large file in pieces that read back as one', async () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 123)
    for (let i = 0; i < big.length; i++) big[i] = (i * 2654435761) >>> 24
    const gz = await compressBackup(big)
    expect(sha256(new Uint8Array(gunzipSync(gz)))).toBe(sha256(big))
    const empty = await compressBackup(new Uint8Array(0))
    expect(gunzipSync(empty).byteLength).toBe(0)
  })

  it('read both new compressed and older plain backups', async () => {
    const bytes = await realFileBytes()
    const dir = tempDir()
    writeFileSync(join(dir, 'old.lockers'), bytes)
    writeFileSync(join(dir, 'new.lockers.gz'), await compressBackup(bytes))
    for (const name of ['old.lockers', 'new.lockers.gz']) {
      const r = await readBackupFile(nodeFs, join(dir, name))
      if (!r.ok) throw new Error(r.problem)
      expect(r.hash).toBe(sha256(bytes))
      expect(r.size).toBe(bytes.byteLength)
    }
  })

  it('call a damaged compressed backup damaged, without throwing', async () => {
    const bytes = await realFileBytes()
    const gz = await compressBackup(bytes)
    const dir = tempDir()
    // Cut short (a sync still downloading), garbage after the gzip header, and a
    // gzip that holds something other than a data file.
    writeFileSync(join(dir, 'short.lockers.gz'), gz.subarray(0, Math.floor(gz.length / 2)))
    writeFileSync(
      join(dir, 'garbage.lockers.gz'),
      new Uint8Array([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 3, 1, 2, 3, 4, 5, 6, 7, 8])
    )
    writeFileSync(join(dir, 'text.lockers.gz'), gzipSync('not a data file at all'))
    for (const name of ['short.lockers.gz', 'garbage.lockers.gz', 'text.lockers.gz']) {
      const r = await readBackupFile(nodeFs, join(dir, name))
      expect(r).toMatchObject({ ok: false, problem: 'not_a_data_file' })
    }
    expect(await readBackupFile(nodeFs, join(dir, 'missing.lockers.gz'))).toEqual({
      ok: false,
      problem: 'not_found'
    })
  })

  it('report a read refused by the system as such', async () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'x.lockers.gz'), await compressBackup(await realFileBytes()))
    const fs = faultyFs([{ method: 'readFile', code: 'EACCES' }])
    expect(await readBackupFile(fs, join(dir, 'x.lockers.gz'))).toMatchObject({
      ok: false,
      problem: 'no_permission'
    })
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
  it('names compressed bytes .lockers.gz and plain bytes .lockers', async () => {
    const dir = tempDir()
    const at = new Date(2026, 9, 6, 9, 0, 0)
    const gz = await writeBackup(nodeFs, dir, 'Locker data', new Uint8Array([1]), at, {
      randomSuffix: suffix,
      compressed: true
    })
    const plain = await writeBackup(nodeFs, dir, 'Locker data', new Uint8Array([2]), at, {
      randomSuffix: suffix,
      compressed: false
    })
    expect(gz).toBe('Locker data 2026-10-06 090000.lockers.gz')
    expect(plain).toBe('Locker data 2026-10-06 090000.lockers')
    expect([...readFileSync(join(dir, plain))]).toEqual([2])
  })
  it('lists older plain and newer compressed backups together', async () => {
    const dir = tempDir()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'Locker data 2026-10-01 090000.lockers'), 'x')
    writeFileSync(join(dir, 'Locker data 2026-10-02 090000.lockers.gz'), 'y')
    writeFileSync(join(dir, 'Locker data 2026-10-03 090000.txt'), 'z')
    const listed = await listBackups(nodeFs, dir, 'Locker data')
    expect(listed.map((e) => e.name)).toEqual([
      'Locker data 2026-10-02 090000.lockers.gz',
      'Locker data 2026-10-01 090000.lockers'
    ])
  })
  it('lists nothing when the folder does not exist yet', async () => {
    expect(await listBackups(nodeFs, join(tempDir(), 'none'), 'Locker data')).toEqual([])
  })
})
