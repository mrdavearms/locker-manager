import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getMeta, setMeta } from '../../../src/main/db/context'
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

async function schoolBytes(name: string, fileId?: string): Promise<Uint8Array> {
  const db = await createNewDatabase(
    { operator: 'Setup', machine: 'SETUP-PC', now: () => new Date('2026-10-01T00:00:00Z') },
    { schoolName: name, appVersion: '0.12.0' }
  )
  if (fileId) setMeta(db, 'file_id', fileId)
  const bytes = db.export()
  db.close()
  return bytes
}

const BACKED_UP_ID = 'SYNTHETIC-file-id'

async function backupBeside(dir: string): Promise<string> {
  const folder = join(dir, BACKUP_FOLDER_NAME, 'Locker data')
  mkdirSync(folder, { recursive: true })
  const path = join(folder, 'Locker data 2026-10-19 151200.lockers.gz')
  writeFileSync(
    path,
    await compressBackup(await schoolBytes('SYNTHETIC Backed Up College', BACKED_UP_ID))
  )
  return path
}

/** A file still readable at the target, with a PIN and one history line of its own. */
async function currentWithPinAndLine(fileId?: string): Promise<Uint8Array> {
  const current = await LockerDb.fromBytes(await schoolBytes('SYNTHETIC Current College', fileId))
  current.run(
    `INSERT INTO settings (key, value, created_at, updated_at, updated_by)
     VALUES ('privacy', '{"pinHash":"scrypt$SYNTHETIC$SYNTHETIC","autoHideSeconds":30}', 'x', 'x', 'Dave')`
  )
  current.run(
    `INSERT INTO audit_log (id, at, operator, machine, action, entity, created_at, updated_at, updated_by)
     VALUES ('synthetic-line', '2026-10-20T03:00:00Z', 'Dave', 'DAVE-MAC', 'codes.revealed', 'locker', 'x', 'x', 'Dave')`
  )
  const bytes = current.export()
  current.close()
  return bytes
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

  it('over a file that still opens, keeps its PIN and its history lines', async () => {
    const dir = tempDir()
    const backup = await backupBeside(dir)
    const target = originalFor(backup)!
    writeFileSync(target, await currentWithPinAndLine(BACKED_UP_ID))
    expect(await restoreBackupFile(nodeFs, backup, target, ctx())).toEqual({ ok: true })
    expect(await nameOf(target)).toBe('SYNTHETIC Backed Up College')
    const db = await LockerDb.fromBytes(new Uint8Array(readFileSync(target)))
    expect(
      db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'privacy'")?.value
    ).toContain('SYNTHETIC')
    expect(db.get("SELECT 1 AS x FROM audit_log WHERE id = 'synthetic-line'")).toBeDefined()
    db.close()
  })

  it('over a different file, keeps none of its PIN or history', async () => {
    const dir = tempDir()
    const backup = await backupBeside(dir)
    const target = originalFor(backup)!
    writeFileSync(target, await currentWithPinAndLine())
    expect(await restoreBackupFile(nodeFs, backup, target, ctx())).toEqual({ ok: true })
    const db = await LockerDb.fromBytes(new Uint8Array(readFileSync(target)))
    expect(getMeta(db, 'file_id')).toBe(BACKED_UP_ID)
    expect(db.get("SELECT 1 AS x FROM settings WHERE key = 'privacy'")).toBeUndefined()
    expect(db.get("SELECT 1 AS x FROM audit_log WHERE id = 'synthetic-line'")).toBeUndefined()
    db.close()
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
