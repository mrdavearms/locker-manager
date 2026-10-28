import { generateKeyPairSync, type KeyObject } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { LockerDb } from '../../../src/main/db/db'
import { createNewDatabase } from '../../../src/main/db/newFile'
import { nodeFs } from '../../../src/main/file/fsPort'
import { lockPathFor } from '../../../src/main/file/lockFile'
import { DataFileSession, type SessionDeps } from '../../../src/main/file/session'
import { Preferences } from '../../../src/main/prefs/preferences'
import { applyKeysAfterOpen } from '../../../src/main/registration/afterOpen'
import { readFileKey, writeFileKey } from '../../../src/main/registration/fileKey'
import { signKey } from '../../../src/main/registration/keyFormat'
import type { RegistrationDetails } from '../../../src/shared/registration'
import { tempDir } from './tmp'

let n = 0
const suffix = (): string => `g${++n}`

/** Timers that never fire on their own: the test drives ticks and saves. */
const noTimers = {
  setTimeout: () => ({}) as unknown as ReturnType<typeof setTimeout>,
  clearTimeout: () => undefined
}

function person(
  name: string,
  computer: string,
  root: string,
  extra: Partial<SessionDeps> = {}
): DataFileSession {
  return new DataFileSession({
    fs: nodeFs,
    appVersion: '0.1.0',
    operator: () => ({ operator: name, machine: computer }),
    now: () => new Date('2026-10-25T09:00:00Z'),
    randomSuffix: suffix,
    localBackupRoot: join(root, `local-backups-${computer}`),
    sessionId: `${name}-${computer}-${suffix()}`,
    pid: 1,
    env: { home: join(root, 'home'), tmpDir: join(root, 'not-tmp'), platform: 'darwin' },
    timers: noTimers,
    ...extra
  })
}

async function newSchoolFile(dir: string, fileKey: string | null = null): Promise<string> {
  const path = join(dir, 'Locker data.lockers')
  const db = await createNewDatabase(
    { operator: 'Setup', machine: 'SETUP-PC', now: () => new Date('2026-10-01T00:00:00Z') },
    { schoolName: 'SYNTHETIC High School', appVersion: '0.1.0' }
  )
  if (fileKey) writeFileKey(db, fileKey)
  writeFileSync(path, db.export())
  db.close()
  return path
}

async function onDisk<T>(path: string, fn: (db: LockerDb) => T): Promise<T> {
  const db = await LockerDb.fromBytes(new Uint8Array(readFileSync(path)))
  try {
    return fn(db)
  } finally {
    db.close()
  }
}

function openState(s: DataFileSession) {
  const st = s.state
  if (st.status !== 'open') throw new Error('expected an open file')
  return st
}

const details: RegistrationDetails = {
  v: 1,
  id: 'R-00012',
  school: 'SYNTHETIC Secondary College',
  name: 'Test Person',
  email: 'test@example.invalid',
  issued: '2026-10-25',
  plan: 'free',
  expires: null
}

let pub: KeyObject
let keyA: string
let keyB: string
const now = new Date('2026-10-25T09:00:00Z')

beforeAll(() => {
  const pair = generateKeyPairSync('ed25519')
  pub = pair.publicKey
  keyA = signKey({ ...details, id: 'R-A' }, pair.privateKey)
  keyB = signKey({ ...details, id: 'R-B' }, pair.privateKey)
})

const never = (): boolean => false

describe('an unregistered copy opens the file read-only', () => {
  it('opens read-only without taking the lock when mayEdit is false', async () => {
    const dir = tempDir()
    const path = await newSchoolFile(dir)
    const s = person('Dave', 'DAVE-MAC', dir, { mayEdit: never })
    expect(await s.open(path)).toEqual({ ok: true })
    expect(openState(s)).toMatchObject({
      mode: 'read_only',
      readOnly: { reason: 'unregistered', holder: null, canTakeOver: false, canStartEditing: false }
    })
    expect(existsSync(lockPathFor(path))).toBe(false)
    await s.tick()
    expect(existsSync(lockPathFor(path))).toBe(false)
    await s.close()
    expect(existsSync(lockPathFor(path))).toBe(false)
  })

  it("does not disturb a colleague's lock", async () => {
    const dir = tempDir()
    const path = await newSchoolFile(dir)
    const sam = person('Sam', 'SAM-PC', dir)
    await sam.open(path)
    expect(openState(sam).mode).toBe('edit')
    const lockBefore = readFileSync(lockPathFor(path), 'utf8')

    const dave = person('Dave', 'DAVE-MAC', dir, { mayEdit: never })
    await dave.open(path)
    await dave.tick()
    await dave.tick()
    expect(readFileSync(lockPathFor(path), 'utf8')).toBe(lockBefore)
    expect(openState(dave).readOnly).toMatchObject({
      reason: 'unregistered',
      canStartEditing: false,
      canTakeOver: false
    })

    // Even when the colleague finishes, the unregistered copy is not offered editing.
    await sam.close()
    expect(existsSync(lockPathFor(path))).toBe(false)
    await dave.tick()
    expect(openState(dave).readOnly).toMatchObject({
      reason: 'unregistered',
      canStartEditing: false,
      canTakeOver: false
    })
    expect(await dave.startEditing()).toMatchObject({ ok: false })
    expect(await dave.takeOver()).toMatchObject({ ok: false })
    expect(existsSync(lockPathFor(path))).toBe(false)
  })

  it('notices when a colleague puts the key into the file, and offers editing once they finish', async () => {
    const dir = tempDir()
    const path = await newSchoolFile(dir)
    const sam = person('Sam', 'SAM-PC', dir)
    await sam.open(path)
    const dave = person('Dave', 'DAVE-MAC', dir, {
      mayEdit: (db) => readFileKey(db) !== null
    })
    await dave.open(path)
    expect(openState(dave).readOnly?.reason).toBe('unregistered')

    sam.write({ action: 'registration.added', entity: 'file' }, (db) => writeFileKey(db, keyA))
    await sam.flush()
    await dave.tick()
    expect(openState(dave).readOnly).toMatchObject({ reason: 'locked', canStartEditing: false })

    await sam.close()
    await dave.tick()
    expect(openState(dave).readOnly).toMatchObject({ reason: 'locked', canStartEditing: true })
    expect(await dave.startEditing()).toEqual({ ok: true })
    expect(openState(dave).mode).toBe('edit')
  })

  it('refuses a write', async () => {
    const dir = tempDir()
    const path = await newSchoolFile(dir)
    const s = person('Dave', 'DAVE-MAC', dir, { mayEdit: never })
    await s.open(path)
    expect(() =>
      s.write({ action: 'school.renamed', entity: 'school' }, (db) =>
        db.run("UPDATE school SET name = 'X'")
      )
    ).toThrow('This file is open read-only.')
  })

  it('opens for editing when mayEdit is true', async () => {
    const dir = tempDir()
    const path = await newSchoolFile(dir)
    const s = person('Dave', 'DAVE-MAC', dir, { mayEdit: () => true })
    await s.open(path)
    expect(openState(s)).toMatchObject({ mode: 'edit', readOnly: null })
    expect(existsSync(lockPathFor(path))).toBe(true)
  })
})

describe('keys copied between the file and this computer after opening', () => {
  async function prefsWith(dir: string, key: string | null): Promise<Preferences> {
    const prefs = new Preferences(join(dir, 'prefs'))
    await prefs.load()
    await prefs.update((p) => ({ ...p, registrationKey: key }))
    return prefs
  }

  it("puts the computer's key back into a restored file", async () => {
    const dir = tempDir()
    const path = await newSchoolFile(dir)
    const prefs = await prefsWith(dir, keyA)
    const s = person('Dave', 'DAVE-MAC', dir, { mayEdit: () => true })
    await s.open(path)
    await applyKeysAfterOpen(s, prefs, { itKey: null, publicKeys: [pub], now })
    await s.flush()
    expect(await onDisk(path, readFileKey)).toBe(keyA)
    const actions = await onDisk(path, (db) =>
      db.all<{ action: string }>('SELECT action FROM audit_log').map((r) => r.action)
    )
    expect(actions).toContain('registration.added')
    expect(prefs.get().registrationKey).toBe(keyA)
  })

  it('never replaces a key already in the file', async () => {
    const dir = tempDir()
    const path = await newSchoolFile(dir, keyA)
    const prefs = await prefsWith(dir, keyB)
    const s = person('Dave', 'DAVE-MAC', dir, { mayEdit: () => true })
    await s.open(path)
    await applyKeysAfterOpen(s, prefs, { itKey: null, publicKeys: [pub], now })
    await s.flush()
    expect(await onDisk(path, readFileKey)).toBe(keyA)
    expect(prefs.get().registrationKey).toBe(keyB)
    expect(openState(s).dirty).toBe(false)
  })

  it("copies the file's key to a computer that has none, even when read-only", async () => {
    const dir = tempDir()
    const path = await newSchoolFile(dir, keyA)
    const prefs = await prefsWith(dir, null)
    const s = person('Dave', 'DAVE-MAC', dir, { mayEdit: never })
    await s.open(path)
    await applyKeysAfterOpen(s, prefs, { itKey: null, publicKeys: [pub], now })
    expect(prefs.get().registrationKey).toBe(keyA)
  })

  it('writes nothing into a file this computer is only viewing', async () => {
    const dir = tempDir()
    const path = await newSchoolFile(dir)
    const before = readFileSync(path)
    const prefs = await prefsWith(dir, keyA)
    const s = person('Dave', 'DAVE-MAC', dir, { mayEdit: never })
    await s.open(path)
    await applyKeysAfterOpen(s, prefs, { itKey: null, publicKeys: [pub], now })
    await s.close()
    expect(readFileSync(path).equals(before)).toBe(true)
  })

  it('never copies a key that does not check out (such as a development stand-in)', async () => {
    const dir = tempDir()
    const path = await newSchoolFile(dir)
    const prefs = await prefsWith(dir, 'DEV')
    const s = person('Dave', 'DAVE-MAC', dir, { mayEdit: () => true })
    await s.open(path)
    await applyKeysAfterOpen(s, prefs, { itKey: 'DEV', publicKeys: [pub], now })
    await s.flush()
    expect(await onDisk(path, readFileKey)).toBeNull()
    expect(openState(s).dirty).toBe(false)
  })
})
