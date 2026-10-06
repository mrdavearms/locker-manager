import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createNewDatabase } from '../../../src/main/db/newFile'
import { nodeFs } from '../../../src/main/file/fsPort'
import { readDataFile, readProblemMessage } from '../../../src/main/file/readDataFile'
import { checkSqliteBytes } from '../../../src/main/file/sqliteHeader'
import { testContext } from '../helpers'
import { faultyFs } from './faultyFs'
import { tempDir } from './tmp'

async function realFileBytes(): Promise<Uint8Array> {
  const db = await createNewDatabase(testContext(), {
    schoolName: 'SYNTHETIC School',
    appVersion: '0.1.0'
  })
  return db.export()
}

describe('checkSqliteBytes', () => {
  it('accepts a real data file', async () => {
    expect(checkSqliteBytes(await realFileBytes())).toBe('ok')
  })
  it('calls a zero-byte or all-zero file "empty" (an unsynced placeholder)', () => {
    expect(checkSqliteBytes(new Uint8Array(0))).toBe('empty')
    expect(checkSqliteBytes(new Uint8Array(8192))).toBe('empty')
  })
  it('calls a file cut short "incomplete"', async () => {
    const bytes = await realFileBytes()
    expect(checkSqliteBytes(bytes.subarray(0, bytes.length - 100))).toBe('incomplete')
    expect(checkSqliteBytes(bytes.subarray(0, 4096))).toBe('incomplete')
  })
  it('rejects something that is not SQLite', () => {
    expect(
      checkSqliteBytes(new TextEncoder().encode('Student Year Level Year 7 Export\n'.repeat(20)))
    ).toBe('not_sqlite')
  })
})

describe('readDataFile', () => {
  it('reads a good file with its hash', async () => {
    const dir = tempDir()
    const path = join(dir, 'Locker data.lockers')
    writeFileSync(path, await realFileBytes())
    const r = await readDataFile(nodeFs, path)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it.each([
    ['a zero-byte placeholder', new Uint8Array(0), 'not_synced'],
    ['a file of zeros', new Uint8Array(4096), 'not_synced'],
    [
      'a spreadsheet',
      new TextEncoder().encode('SUSSI ID,First Name\n'.repeat(10)),
      'not_a_data_file'
    ]
  ])('explains %s', async (_label, bytes, problem) => {
    const dir = tempDir()
    const path = join(dir, 'Locker data.lockers')
    writeFileSync(path, bytes)
    const r = await readDataFile(nodeFs, path)
    expect(r).toMatchObject({ ok: false, problem })
  })

  it('explains a missing file', async () => {
    expect(await readDataFile(nodeFs, join(tempDir(), 'nope.lockers'))).toMatchObject({
      ok: false,
      problem: 'not_found'
    })
  })

  it('explains a refused read', async () => {
    const dir = tempDir()
    const path = join(dir, 'Locker data.lockers')
    writeFileSync(path, 'x')
    const r = await readDataFile(faultyFs([{ method: 'readFile', code: 'EACCES' }]), path)
    expect(r).toMatchObject({ ok: false, problem: 'no_permission' })
  })

  it('explains a placeholder that cannot download (offline)', async () => {
    const dir = tempDir()
    const path = join(dir, 'Locker data.lockers')
    writeFileSync(path, 'x')
    const r = await readDataFile(faultyFs([{ method: 'readFile', code: 'ETIMEDOUT' }]), path)
    expect(r).toMatchObject({ ok: false, problem: 'unreadable' })
  })

  it('has a plain message for every problem', () => {
    for (const p of [
      'not_found',
      'not_synced',
      'incomplete',
      'not_a_data_file',
      'no_permission',
      'unreadable'
    ] as const) {
      expect(readProblemMessage(p).length).toBeGreaterThan(20)
    }
    expect(readProblemMessage('not_synced')).toMatch(/finished syncing/)
  })
})
