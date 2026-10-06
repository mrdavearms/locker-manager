import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LockerDb } from '../../../src/main/db/db'
import { createNewDatabase } from '../../../src/main/db/newFile'
import { summarise } from '../../../src/main/db/summary'
import { BACKUP_FOLDER_NAME } from '../../../src/main/file/backups'
import { nodeFs } from '../../../src/main/file/fsPort'
import { lockPathFor, STALE_AFTER_MS } from '../../../src/main/file/lockFile'
import { DataFileSession, type SessionDeps } from '../../../src/main/file/session'
import { tempDir } from './tmp'

let n = 0
const suffix = (): string => `s${++n}`

/** Timers that only fire when the test says so. */
function manualTimers() {
  const pending = new Set<{ fn: () => void }>()
  return {
    timers: {
      setTimeout: (fn: () => void) => {
        const t = { fn }
        pending.add(t)
        return t as unknown as ReturnType<typeof setTimeout>
      },
      clearTimeout: (t: ReturnType<typeof setTimeout>) => {
        pending.delete(t as unknown as { fn: () => void })
      }
    },
    pendingCount: () => pending.size
  }
}

interface Person {
  session: DataFileSession
  clock: { t: number }
}

function person(
  name: string,
  computer: string,
  root: string,
  clock = { t: Date.parse('2026-10-06T09:12:00Z') },
  extra: Partial<SessionDeps> = {}
): Person {
  const { timers } = manualTimers()
  const session = new DataFileSession({
    fs: nodeFs,
    appVersion: '0.1.0',
    operator: () => ({ operator: name, machine: computer }),
    now: () => new Date(clock.t),
    randomSuffix: suffix,
    localBackupRoot: join(root, `local-backups-${computer}`),
    sessionId: `${name}-${computer}-${suffix()}`,
    pid: 1,
    env: { home: join(root, 'home'), tmpDir: join(root, 'not-tmp'), platform: 'darwin' },
    timers,
    ...extra
  })
  return { session, clock }
}

async function newSchoolFile(dir: string, name = 'Locker data.lockers'): Promise<string> {
  const path = join(dir, name)
  const db = await createNewDatabase(
    { operator: 'Setup', machine: 'SETUP-PC', now: () => new Date('2026-10-01T00:00:00Z') },
    { schoolName: 'SYNTHETIC High School', appVersion: '0.1.0' }
  )
  writeFileSync(path, db.export())
  db.close()
  return path
}

function rename(p: Person, name: string): void {
  p.session.write({ action: 'school.renamed', entity: 'school', after: { name } }, (db) => {
    db.run('UPDATE school SET name = $n', { $n: name })
  })
}

async function schoolNameOnDisk(path: string): Promise<string> {
  const db = await LockerDb.fromBytes(new Uint8Array(readFileSync(path)))
  const name = summarise(db).schoolName
  db.close()
  return name
}

function openState(p: Person) {
  const s = p.session.state
  if (s.status !== 'open') throw new Error('expected an open file')
  return s
}

describe('opening', () => {
  it('opens for editing and writes the lock', async () => {
    const dir = tempDir()
    const path = await newSchoolFile(dir)
    const dave = person('Dave', 'DAVE-MAC', dir)
    expect(await dave.session.open(path)).toEqual({ ok: true })
    expect(openState(dave)).toMatchObject({
      mode: 'edit',
      readOnly: null,
      dirty: false,
      summary: { schoolName: 'SYNTHETIC High School' }
    })
    expect(JSON.parse(readFileSync(lockPathFor(path), 'utf8'))).toMatchObject({
      operator: 'Dave',
      computer: 'DAVE-MAC'
    })
  })

  it('creates a new file and refuses to create over an existing one', async () => {
    const dir = tempDir()
    const dave = person('Dave', 'DAVE-MAC', dir)
    const db = await createNewDatabase(
      { operator: 'Dave', machine: 'DAVE-MAC', now: () => new Date() },
      { schoolName: 'SYNTHETIC A', appVersion: '0.1.0' }
    )
    expect(await dave.session.createNew(join(dir, 'A.lockers'), db)).toEqual({ ok: true })
    const db2 = await createNewDatabase(
      { operator: 'Dave', machine: 'DAVE-MAC', now: () => new Date() },
      { schoolName: 'SYNTHETIC B', appVersion: '0.1.0' }
    )
    const again = await person('Dave', 'DAVE-MAC', dir).session.createNew(
      join(dir, 'A.lockers'),
      db2
    )
    expect(again).toMatchObject({ ok: false, message: expect.stringMatching(/already there/) })
  })

  it('explains an unsynced placeholder instead of opening it (SPEC.md 6.1)', async () => {
    const dir = tempDir()
    const path = join(dir, 'Locker data.lockers')
    writeFileSync(path, '')
    const r = await person('Dave', 'DAVE-MAC', dir).session.open(path)
    expect(r).toMatchObject({ ok: false, message: expect.stringMatching(/finished syncing/) })
    expect(existsSync(lockPathFor(path))).toBe(false)
  })

  it('opens a file from a newer version read-only and leaves it alone', async () => {
    const dir = tempDir()
    const path = join(dir, 'Locker data.lockers')
    const db = await createNewDatabase(
      { operator: 'X', machine: 'X', now: () => new Date() },
      { schoolName: 'SYNTHETIC', appVersion: '9.0.0' }
    )
    db.userVersion = 99
    writeFileSync(path, db.export())
    const before = readFileSync(path)
    const dave = person('Dave', 'DAVE-MAC', dir)
    await dave.session.open(path)
    expect(openState(dave)).toMatchObject({
      mode: 'read_only',
      readOnly: { reason: 'newer_version' }
    })
    expect(existsSync(lockPathFor(path))).toBe(false)
    await dave.session.close()
    expect(readFileSync(path).equals(before)).toBe(true)
  })

  it('warns when the file is in Downloads', async () => {
    const dir = tempDir()
    const downloads = join(dir, 'home', 'Downloads')
    mkdirSync(downloads, { recursive: true })
    const path = await newSchoolFile(downloads)
    const dave = person('Dave', 'DAVE-MAC', dir)
    await dave.session.open(path)
    expect(openState(dave).locationWarning).toMatch(/Downloads folder/)
  })

  it('tidies temporary files older than a day, and only those', async () => {
    const dir = tempDir()
    const path = await newSchoolFile(dir)
    const old = `${path}.tmp-old`
    const young = `${path}.tmp-young`
    writeFileSync(old, 'x')
    writeFileSync(young, 'x')
    const twoDaysAgo = (Date.parse('2026-10-06T09:12:00Z') - 2 * 86_400_000) / 1000
    utimesSync(old, twoDaysAgo, twoDaysAgo)
    await person('Dave', 'DAVE-MAC', dir).session.open(path)
    expect(existsSync(old)).toBe(false)
    expect(existsSync(young)).toBe(true)
  })
})

describe('saving', () => {
  it('saves a change, keeps the previous version in both backup places', async () => {
    const dir = tempDir()
    const path = await newSchoolFile(dir)
    const dave = person('Dave', 'DAVE-MAC', dir)
    await dave.session.open(path)
    rename(dave, 'SYNTHETIC Renamed')
    expect(openState(dave).dirty).toBe(true)
    await dave.session.flush()
    expect(openState(dave)).toMatchObject({ dirty: false, problems: [] })
    expect(await schoolNameOnDisk(path)).toBe('SYNTHETIC Renamed')
    expect(readdirSync(join(dir, BACKUP_FOLDER_NAME, 'Locker data'))).toHaveLength(1)
    const local = join(dir, 'local-backups-DAVE-MAC')
    expect(readdirSync(local)).toHaveLength(1)
  })

  it('still saves when the shared backup folder cannot be written, and says so', async () => {
    const dir = tempDir()
    const path = await newSchoolFile(dir)
    writeFileSync(join(dir, BACKUP_FOLDER_NAME), 'a file where the folder should be')
    const dave = person('Dave', 'DAVE-MAC', dir)
    await dave.session.open(path)
    rename(dave, 'SYNTHETIC Renamed')
    await dave.session.flush()
    expect(await schoolNameOnDisk(path)).toBe('SYNTHETIC Renamed')
    expect(openState(dave).problems).toEqual([
      expect.objectContaining({
        kind: 'backup_failed',
        message: expect.stringMatching(/shared folder/)
      })
    ])
  })

  it('saves unsaved changes on close and releases the lock', async () => {
    const dir = tempDir()
    const path = await newSchoolFile(dir)
    const dave = person('Dave', 'DAVE-MAC', dir)
    await dave.session.open(path)
    rename(dave, 'SYNTHETIC Closed')
    await dave.session.close()
    expect(await schoolNameOnDisk(path)).toBe('SYNTHETIC Closed')
    expect(existsSync(lockPathFor(path))).toBe(false)
  })
})

describe('two people, one file (SPEC.md 6.2)', () => {
  it('the second opens read-only and sees who is editing', async () => {
    const dir = tempDir()
    const path = await newSchoolFile(dir)
    const hannah = person('Hannah', 'OFFICE-PC', dir)
    const dave = person('Dave', 'DAVE-MAC', dir)
    await hannah.session.open(path)
    await dave.session.open(path)
    expect(openState(dave)).toMatchObject({
      mode: 'read_only',
      readOnly: {
        reason: 'locked',
        holder: { operator: 'Hannah', computer: 'OFFICE-PC' },
        canTakeOver: false
      }
    })
    expect(() => rename(dave, 'nope')).toThrow(/read-only/)
  })

  it('the read-only copy reloads when the editor saves', async () => {
    const dir = tempDir()
    const path = await newSchoolFile(dir)
    const hannah = person('Hannah', 'OFFICE-PC', dir)
    const dave = person('Dave', 'DAVE-MAC', dir)
    await hannah.session.open(path)
    await dave.session.open(path)
    rename(hannah, 'SYNTHETIC Hannah Was Here')
    await hannah.session.flush()
    await dave.session.tick()
    expect(openState(dave).summary.schoolName).toBe('SYNTHETIC Hannah Was Here')
  })

  it('offers "start editing" once the editor closes', async () => {
    const dir = tempDir()
    const path = await newSchoolFile(dir)
    const hannah = person('Hannah', 'OFFICE-PC', dir)
    const dave = person('Dave', 'DAVE-MAC', dir)
    await hannah.session.open(path)
    await dave.session.open(path)
    await hannah.session.close()
    await dave.session.tick()
    expect(openState(dave).readOnly?.canStartEditing).toBe(true)
    expect(await dave.session.startEditing()).toEqual({ ok: true })
    expect(openState(dave).mode).toBe('edit')
  })

  it('offers takeover only after 10 minutes of silence, logs it, and the old editor follows', async () => {
    const dir = tempDir()
    const path = await newSchoolFile(dir)
    const clock = { t: Date.parse('2026-10-06T09:12:00Z') }
    const hannah = person('Hannah', 'OFFICE-PC', dir, clock)
    const dave = person('Dave', 'DAVE-MAC', dir, clock)
    await hannah.session.open(path)
    rename(hannah, 'SYNTHETIC Unsaved By Hannah')
    clock.t += 5 * 60_000
    await dave.session.open(path)
    expect(openState(dave).readOnly?.canTakeOver).toBe(false)
    expect(await dave.session.takeOver()).toMatchObject({ ok: false })

    clock.t += STALE_AFTER_MS
    await dave.session.tick()
    expect(openState(dave).readOnly).toMatchObject({ reason: 'stale_lock', canTakeOver: true })
    expect(await dave.session.takeOver()).toEqual({ ok: true })
    expect(openState(dave).mode).toBe('edit')
    expect(openState(dave).summary.lastChange).toMatchObject({
      action: 'lock.taken_over',
      operator: 'Dave'
    })

    // Hannah's computer wakes up: she has lost the lock; her unsaved change is kept as a backup.
    await hannah.session.tick()
    expect(openState(hannah)).toMatchObject({
      mode: 'read_only',
      readOnly: { reason: 'lost_lock', holder: { operator: 'Dave' } }
    })
    const backups = readdirSync(join(dir, BACKUP_FOLDER_NAME, 'Locker data'))
    expect(backups.some((b) => b.includes('unsaved changes when editing was taken over'))).toBe(
      true
    )
  })
})

describe('conflicts (SPEC.md 6.4)', () => {
  async function editedUnderneath() {
    const dir = tempDir()
    const path = await newSchoolFile(dir)
    const dave = person('Dave', 'DAVE-MAC', dir)
    await dave.session.open(path)
    // Someone else's computer writes a different version (for example a sync race).
    const other = await LockerDb.fromBytes(new Uint8Array(readFileSync(path)))
    other.run("UPDATE school SET name = 'SYNTHETIC From Elsewhere'")
    other.run(
      `INSERT INTO audit_log (id, at, operator, machine, action, entity, created_at, updated_at, updated_by)
       VALUES ('x1', '2026-10-06T09:13:00Z', 'Hannah', 'OFFICE-PC', 'school.renamed', 'school', 'x', 'x', 'Hannah')`
    )
    writeFileSync(path, other.export())
    other.close()
    rename(dave, 'SYNTHETIC From Dave')
    await dave.session.flush()
    return { dir, path, dave }
  }

  it('stops the save and shows both versions with what each side did', async () => {
    const { path, dave } = await editedUnderneath()
    const s = openState(dave)
    expect(s.conflict).toMatchObject({
      reason: 'changed_on_disk',
      mine: { schoolName: 'SYNTHETIC From Dave' },
      theirs: { schoolName: 'SYNTHETIC From Elsewhere' }
    })
    expect(s.conflict?.onlyTheirs.map((h) => h.operator)).toEqual(['Hannah'])
    expect(s.conflict?.onlyMine.map((h) => h.operator)).toEqual(['Dave'])
    expect(await schoolNameOnDisk(path)).toBe('SYNTHETIC From Elsewhere')
    expect(() => rename(dave, 'blocked')).toThrow(/conflict/)
  })

  it('keep mine: mine is saved, theirs is kept as a backup', async () => {
    const { dir, path, dave } = await editedUnderneath()
    expect(await dave.session.resolveConflict('keep_mine')).toEqual({ ok: true })
    expect(await schoolNameOnDisk(path)).toBe('SYNTHETIC From Dave')
    const backups = readdirSync(join(dir, BACKUP_FOLDER_NAME, 'Locker data'))
    expect(backups.some((b) => b.includes('other version from Hannah'))).toBe(true)
  })

  it('keep theirs: theirs is loaded, mine is kept as a backup', async () => {
    const { dir, path, dave } = await editedUnderneath()
    expect(await dave.session.resolveConflict('keep_theirs')).toEqual({ ok: true })
    expect(openState(dave)).toMatchObject({
      conflict: null,
      summary: { schoolName: 'SYNTHETIC From Elsewhere' }
    })
    expect(await schoolNameOnDisk(path)).toBe('SYNTHETIC From Elsewhere')
    const backups = readdirSync(join(dir, BACKUP_FOLDER_NAME, 'Locker data'))
    expect(backups.some((b) => b.includes('my unsaved changes'))).toBe(true)
  })

  it('a vanished file is noticed and can be written back', async () => {
    const dir = tempDir()
    const path = await newSchoolFile(dir)
    const dave = person('Dave', 'DAVE-MAC', dir)
    await dave.session.open(path)
    await nodeFs.unlink(path)
    rename(dave, 'SYNTHETIC Survivor')
    await dave.session.flush()
    expect(openState(dave).conflict?.reason).toBe('missing')
    expect(await dave.session.resolveConflict('keep_mine')).toEqual({ ok: true })
    expect(await schoolNameOnDisk(path)).toBe('SYNTHETIC Survivor')
  })

  it('the heartbeat notices a change on disk before any save', async () => {
    const dir = tempDir()
    const path = await newSchoolFile(dir)
    const dave = person('Dave', 'DAVE-MAC', dir)
    await dave.session.open(path)
    const other = await LockerDb.fromBytes(new Uint8Array(readFileSync(path)))
    other.run("UPDATE school SET name = 'SYNTHETIC Changed'")
    writeFileSync(path, other.export())
    other.close()
    await dave.session.tick()
    expect(openState(dave).conflict?.reason).toBe('changed_on_disk')
  })

  it('closing with an unresolved conflict keeps this computer’s changes as a backup', async () => {
    const { dir, dave } = await editedUnderneath()
    await dave.session.close()
    const backups = readdirSync(join(dir, BACKUP_FOLDER_NAME, 'Locker data'))
    expect(backups.some((b) => b.includes('unsaved changes at close'))).toBe(true)
  })
})

describe('sync copies beside the file (SPEC.md 6.3)', () => {
  async function withCopy() {
    const dir = tempDir()
    const path = await newSchoolFile(dir)
    const copy = await LockerDb.fromBytes(new Uint8Array(readFileSync(path)))
    copy.run("UPDATE school SET name = 'SYNTHETIC The Copy'")
    writeFileSync(join(dir, 'Locker data-OFFICE-PC.lockers'), copy.export())
    copy.close()
    const dave = person('Dave', 'DAVE-MAC', dir)
    await dave.session.open(path)
    return { dir, path, dave }
  }

  it('are found on open and can be compared', async () => {
    const { dave } = await withCopy()
    expect(openState(dave).conflictCopies).toEqual(['Locker data-OFFICE-PC.lockers'])
    expect(await dave.session.compareCopy('Locker data-OFFICE-PC.lockers')).toEqual({ ok: true })
    expect(openState(dave).conflict).toMatchObject({
      reason: 'copy',
      theirs: { schoolName: 'SYNTHETIC The Copy' }
    })
    dave.session.closeComparison()
    expect(openState(dave).conflict).toBeNull()
  })

  it('keep current: the copy moves into the backups', async () => {
    const { dir, path, dave } = await withCopy()
    expect(await dave.session.resolveCopy('Locker data-OFFICE-PC.lockers', 'keep_current')).toEqual(
      { ok: true }
    )
    expect(existsSync(join(dir, 'Locker data-OFFICE-PC.lockers'))).toBe(false)
    expect(openState(dave).conflictCopies).toEqual([])
    expect(await schoolNameOnDisk(path)).toBe('SYNTHETIC High School')
    expect(
      readdirSync(join(dir, BACKUP_FOLDER_NAME, 'Locker data')).some((b) =>
        b.includes('copy Locker data-OFFICE-PC')
      )
    ).toBe(true)
  })

  it('use copy: the copy replaces the file, the old file moves into the backups', async () => {
    const { dir, path, dave } = await withCopy()
    expect(await dave.session.resolveCopy('Locker data-OFFICE-PC.lockers', 'use_copy')).toEqual({
      ok: true
    })
    expect(await schoolNameOnDisk(path)).toBe('SYNTHETIC The Copy')
    expect(openState(dave).summary.schoolName).toBe('SYNTHETIC The Copy')
    expect(
      readdirSync(join(dir, BACKUP_FOLDER_NAME, 'Locker data')).some((b) =>
        b.includes('replaced by Locker data-OFFICE-PC')
      )
    ).toBe(true)
  })

  it('can be ignored when the operator says it is not a copy', async () => {
    const dir = tempDir()
    const path = await newSchoolFile(dir)
    writeFileSync(join(dir, 'Locker data (1).lockers'), readFileSync(path))
    const dave = person('Dave', 'DAVE-MAC', dir, undefined, {
      ignoredCopies: () => ['Locker data (1).lockers']
    })
    await dave.session.open(path)
    expect(openState(dave).conflictCopies).toEqual([])
  })
})

describe('restoring a backup (SPEC.md 4.12)', () => {
  it('previews what a restore undoes, restores, and keeps the current version', async () => {
    const dir = tempDir()
    const path = await newSchoolFile(dir)
    const clock = { t: Date.parse('2026-10-06T09:12:00Z') }
    const dave = person('Dave', 'DAVE-MAC', dir, clock)
    await dave.session.open(path)
    rename(dave, 'SYNTHETIC Version Two')
    await dave.session.flush()
    clock.t += 60_000
    rename(dave, 'SYNTHETIC Version Three')
    await dave.session.flush()

    const backups = await dave.session.listAllBackups()
    const shared = backups.filter((b) => b.source === 'shared')
    expect(shared).toHaveLength(2)
    const versionTwo = shared[0]!
    const preview = await dave.session.previewBackup(versionTwo)
    if ('error' in preview) throw new Error(preview.error)
    expect(preview.backupSummary.schoolName).toBe('SYNTHETIC Version Two')
    expect(preview.undone.map((h) => h.action)).toEqual(['school.renamed'])

    clock.t += 60_000
    expect(await dave.session.restoreBackup(versionTwo)).toEqual({ ok: true })
    expect(await schoolNameOnDisk(path)).toBe('SYNTHETIC Version Two')
    expect(openState(dave).summary.lastChange?.action).toBe('file.restored')
    const after = await dave.session.listAllBackups()
    expect(after.some((b) => b.label?.startsWith('before restoring'))).toBe(true)
  })

  it('refuses a backup name that tries to leave the backups folder', async () => {
    const dir = tempDir()
    const path = await newSchoolFile(dir)
    const dave = person('Dave', 'DAVE-MAC', dir)
    await dave.session.open(path)
    await expect(
      dave.session.restoreBackup({ source: 'shared', name: '../Locker data.lockers' })
    ).rejects.toThrow(/Bad backup name/)
  })
})
