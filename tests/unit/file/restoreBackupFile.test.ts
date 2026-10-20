import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LockerDb } from '../../../src/main/db/db'
import { createNewDatabase } from '../../../src/main/db/newFile'
import { summarise } from '../../../src/main/db/summary'
import { BACKUP_FOLDER_NAME, compressBackup } from '../../../src/main/file/backups'
import { nodeFs } from '../../../src/main/file/fsPort'
import { lockPathFor } from '../../../src/main/file/lockFile'
import { originalFor, restoreBackupFile } from '../../../src/main/file/restoreBackupFile'
import { tempDir } from './tmp'

// docs/audits/2026-10-20-stability-audit.md, finding 5: a damaged file said "open
// a backup", but the app could not open one.

let n = 0
const ctx = (now = new Date('2026-10-20T04:00:00Z')) => ({
  now: () => now,
  randomSuffix: () => `r${++n}`,
  sessionId: 'me'
})

async function schoolBytes(name: string): Promise<Uint8Array> {
  const db = await createNewDatabase(
    { operator: 'Setup', machine: 'SETUP-PC', now: () => new Date('2026-10-01T00:00:00Z') },
    { schoolName: name, appVersion: '0.12.0' }
  )
  const bytes = db.export()
  db.close()
  return bytes
}

async function backupBeside(dir: string): Promise<string> {
  const folder = join(dir, BACKUP_FOLDER_NAME, 'Locker data')
  mkdirSync(folder, { recursive: true })
  const path = join(folder, 'Locker data 2026-10-19 151200.lockers.gz')
  writeFileSync(path, await compressBackup(await schoolBytes('SYNTHETIC Backed Up College')))
  return path
}

async function nameOf(path: string): Promise<string> {
  const db = await LockerDb.fromBytes(new Uint8Array(readFileSync(path)))
  const name = summarise(db).schoolName
  db.close()
  return name
}

describe('opening a backup when the file will not open', () => {
  it('knows where a backup beside the file came from', () => {
    expect(originalFor(join('/share', BACKUP_FOLDER_NAME, 'Locker data', 'x.lockers.gz'))).toBe(
      join('/share', 'Locker data.lockers')
    )
    expect(originalFor('/somewhere/else/x.lockers.gz')).toBeNull()
  })

  it('restores a compressed backup over a damaged file, keeping the damaged one', async () => {
    const dir = tempDir()
    const backup = await backupBeside(dir)
    const target = originalFor(backup)!
    writeFileSync(target, 'SQLite format 3\0 but damaged')
    expect(await restoreBackupFile(nodeFs, backup, target, ctx())).toEqual({ ok: true })
    expect(await nameOf(target)).toBe('SYNTHETIC Backed Up College')
    const kept = readdirSync(join(dir, BACKUP_FOLDER_NAME, 'Locker data'))
    expect(kept.some((f) => f.includes('set aside when a backup was restored'))).toBe(true)
  })

  it('refuses something that is not a Locker Manager backup, changing nothing', async () => {
    const dir = tempDir()
    const notBackup = join(dir, 'notes.lockers.gz')
    writeFileSync(notBackup, await compressBackup(new TextEncoder().encode('hello')))
    const target = join(dir, 'Locker data.lockers')
    writeFileSync(target, 'keep me')
    const r = await restoreBackupFile(nodeFs, notBackup, target, ctx())
    expect(r.ok).toBe(false)
    expect(readFileSync(target, 'utf8')).toBe('keep me')
  })

  it('refuses to replace a file someone is editing', async () => {
    const dir = tempDir()
    const backup = await backupBeside(dir)
    const target = originalFor(backup)!
    writeFileSync(target, await schoolBytes('SYNTHETIC In Use'))
    writeFileSync(
      lockPathFor(target),
      JSON.stringify({
        format: 1,
        sessionId: 'hannah',
        operator: 'Hannah',
        computer: 'OFFICE-PC',
        appVersion: '0.12.0',
        pid: 1,
        startedAt: '2026-10-20T03:59:00Z',
        heartbeatAt: '2026-10-20T03:59:30Z'
      })
    )
    const r = await restoreBackupFile(nodeFs, backup, target, ctx())
    expect(r).toMatchObject({ ok: false, message: /Hannah on OFFICE-PC is editing/ })
    expect(await nameOf(target)).toBe('SYNTHETIC In Use')
  })
})
