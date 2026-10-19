import { chmodSync, existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  failedWindowsAttempt,
  folderWritable,
  recordWindowsAttempt
} from '../../../src/main/update/windowsAttempt'
import { tempDir } from '../file/tmp'

// docs/audits/2026-10-20-stability-audit.md, finding 2.
describe('Windows install attempts', () => {
  it('report an install that did not finish, until the version is reached', () => {
    const dir = tempDir()
    expect(failedWindowsAttempt(dir, '0.11.4')).toBeNull()
    recordWindowsAttempt(dir, '0.12.0', new Date('2026-10-20T00:00:00Z'))
    // Started again on the old version: the install did not happen.
    expect(failedWindowsAttempt(dir, '0.11.4')).toBe('0.12.0')
    expect(failedWindowsAttempt(dir, '0.11.4')).toBe('0.12.0')
    // Installed by hand (or by a later update): the record is cleared.
    expect(failedWindowsAttempt(dir, '0.12.0')).toBeNull()
    expect(existsSync(join(dir, 'update-attempt.json'))).toBe(false)
  })

  it('ignore a damaged record', () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'update-attempt.json'), '{ not json')
    expect(failedWindowsAttempt(dir, '0.11.4')).toBeNull()
    writeFileSync(join(dir, 'update-attempt.json'), '{"version": 12}')
    expect(failedWindowsAttempt(dir, '0.11.4')).toBeNull()
  })

  it('never throws when the folder cannot be written', () => {
    expect(() =>
      recordWindowsAttempt(join(tempDir(), 'missing', 'deeper'), '0.12.0', new Date())
    ).not.toThrow()
  })

  it('tell whether this account can change the app folder, leaving nothing behind', async () => {
    const dir = tempDir()
    expect(await folderWritable(dir)).toBe(true)
    expect(readdirSync(dir)).toEqual([])
    expect(await folderWritable(join(dir, 'not-there'))).toBe(false)
    if (process.platform !== 'win32' && process.getuid?.() !== 0) {
      chmodSync(dir, 0o555)
      expect(await folderWritable(dir)).toBe(false)
      chmodSync(dir, 0o755)
    }
  })
})
