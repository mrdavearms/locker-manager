import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createNewDatabase } from '../../../src/main/db/newFile'
import { readItRegistrationKey, registrationKeyPath } from '../../../src/main/managed'
import { readFileKey, writeFileKey } from '../../../src/main/registration/fileKey'
import { keyProblemMessage } from '../../../src/main/registration/registration'
import { testContext } from '../helpers'

async function db() {
  return createNewDatabase(testContext(), { schoolName: 'SYNTHETIC College', appVersion: '0.12.1' })
}

describe('the key kept in the school file', () => {
  it('reads back what was written', async () => {
    const d = await db()
    writeFileKey(d, 'LM1.abc.def')
    expect(readFileKey(d)).toBe('LM1.abc.def')
  })

  it('reads null when the file has no key', async () => {
    expect(readFileKey(await db())).toBeNull()
  })
})

describe('the key IT puts on the computer', () => {
  const saved = process.env.LOCKER_MANAGER_MANAGED_DIR
  afterEach(() => {
    if (saved === undefined) delete process.env.LOCKER_MANAGER_MANAGED_DIR
    else process.env.LOCKER_MANAGER_MANAGED_DIR = saved
  })

  it('is null when the file is missing', () => {
    process.env.LOCKER_MANAGER_MANAGED_DIR = mkdtempSync(join(tmpdir(), 'lm-reg-'))
    expect(readItRegistrationKey()).toBeNull()
  })

  it('drops a byte-order mark and spaces', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lm-reg-'))
    process.env.LOCKER_MANAGER_MANAGED_DIR = dir
    writeFileSync(join(dir, 'registration.key'), '\uFEFFLM1.abc\r\n')
    expect(registrationKeyPath()).toBe(join(dir, 'registration.key'))
    expect(readItRegistrationKey()).toBe('LM1.abc')
  })

  it('sits beside managed.json in an installed copy', () => {
    expect(registrationKeyPath('darwin', true)).toBe(
      '/Library/Application Support/Locker Manager/registration.key'
    )
    expect(registrationKeyPath('win32', true)).toBe(
      'C:\\ProgramData\\Locker Manager\\registration.key'
    )
  })
})

describe('what staff are told about a key that does not work', () => {
  it('has plain wording for each reason', () => {
    expect(keyProblemMessage('malformed')).toBe(
      "That doesn't look like a Locker Manager key. Copy the whole key from the email, starting with LM1."
    )
    expect(keyProblemMessage('bad_signature')).toBe(
      "That key isn't valid. Check you copied all of it, or ask for a new one."
    )
    expect(keyProblemMessage('unknown_version')).toBe(
      'That key is for a newer version of Locker Manager. Update the app, then try again.'
    )
  })

  it('names the expiry date', () => {
    expect(keyProblemMessage('expired', '2026-10-06')).toBe(
      'That key expired on 6 Oct 2026. Ask for a new one.'
    )
  })
})
