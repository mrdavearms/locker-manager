import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseManaged, resetManagedCache } from '../../src/main/managed'
import {
  codesLocked,
  noteOpenFile,
  privacyView,
  setPin,
  shownCode,
  unlockCodes
} from '../../src/main/privacy'
import { allocatedDemo } from './fixtures'

afterEach(() => {
  delete process.env.LOCKER_MANAGER_MANAGED
  resetManagedCache()
  noteOpenFile(null)
})

describe('PIN for codes (SPEC.md 7 item 12)', () => {
  it('locks codes until the PIN is entered, and never stores the PIN itself', async () => {
    const { db, ctx } = await allocatedDemo()
    noteOpenFile('a.lockers')
    expect(codesLocked(db)).toBeNull()
    setPin(db, ctx, '4821', null)
    expect(JSON.stringify(db.all('SELECT value FROM settings'))).not.toContain('4821')
    expect(codesLocked(db)).toMatch(/Enter the PIN/)
    const locker = db.get<{ locker_id: string }>(
      "SELECT locker_id FROM assignment WHERE status='current' LIMIT 1"
    )!.locker_id
    expect(shownCode(db, ctx, locker, '1234')).toBeNull()
    expect(() => unlockCodes(db, '0000')).toThrow(/not right/)
    expect(unlockCodes(db, '4821').unlocked).toBe(true)
    expect(codesLocked(db)).toBeNull()
    expect(shownCode(db, ctx, locker, '1234')).toMatch(/^\d{4}$/)
    // Another file starts locked again.
    noteOpenFile('b.lockers')
    expect(privacyView(db).unlocked).toBe(false)
  })
  it('needs the current PIN to change or remove it, and waits after five wrong tries', async () => {
    const { db, ctx } = await allocatedDemo()
    noteOpenFile('c.lockers')
    setPin(db, ctx, '1357', null)
    expect(() => setPin(db, ctx, '2468', '0000')).toThrow(/current PIN/)
    expect(() => setPin(db, ctx, '12', '1357')).toThrow(/4 to 8/)
    for (let i = 0; i < 5; i++) expect(() => unlockCodes(db, '9999', 1000)).toThrow(/not right/)
    expect(() => unlockCodes(db, '1357', 2000)).toThrow(/Too many/)
    expect(unlockCodes(db, '1357', 40_000).unlocked).toBe(true)
    setPin(db, ctx, null, '1357')
    expect(privacyView(db).pinSet).toBe(false)
  })
})

describe('managed settings for school IT (SPEC.md 9.5)', () => {
  it('reads the known keys and refuses anything else', () => {
    expect(parseManaged('{"autoUpdate": false, "demoEnabled": false}')).toEqual({
      managed: { autoUpdate: false, demoEnabled: false },
      problem: null
    })
    expect(parseManaged('{"autoUpdate": "no"}').problem).toMatch(/ignored/)
    expect(parseManaged('{"colour": "red"}').problem).toMatch(/ignored/)
    expect(parseManaged('not json').problem).toMatch(/not valid JSON/)
  })
  it('a managed PIN requirement blocks codes until a PIN is set, and the PIN cannot be removed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lm-managed-'))
    writeFileSync(join(dir, 'managed.json'), '{"requirePinForCodes": true}')
    process.env.LOCKER_MANAGER_MANAGED = join(dir, 'managed.json')
    resetManagedCache()
    const { db, ctx } = await allocatedDemo()
    noteOpenFile('d.lockers')
    expect(codesLocked(db)).toMatch(/IT team/)
    setPin(db, ctx, '8642', null)
    expect(() => setPin(db, ctx, null, '8642')).toThrow(/IT team/)
  })
})
