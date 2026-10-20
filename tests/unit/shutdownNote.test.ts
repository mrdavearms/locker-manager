import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  shutdownNoteMessage,
  takeShutdownNote,
  writeShutdownNote
} from '../../src/main/shutdownNote'
import { tempDir } from './file/tmp'

describe('the note about changes not saved at a Windows shutdown', () => {
  it('is read once, then gone', () => {
    const dir = tempDir()
    expect(takeShutdownNote(dir)).toBeNull()
    writeShutdownNote(dir, {
      path: 'S:\\Lockers\\Locker data.lockers',
      backup: 'Locker data 2026-10-20 151200 unsaved changes at shutdown.lockers.gz',
      at: '2026-10-20T04:12:00.000Z'
    })
    const note = takeShutdownNote(dir)
    expect(note?.backup).toMatch(/unsaved changes at shutdown/)
    expect(shutdownNoteMessage(note!)).toMatch(/kept as a backup on this computer/)
    expect(takeShutdownNote(dir)).toBeNull()
    expect(existsSync(join(dir, 'unsaved-at-shutdown.json'))).toBe(false)
  })

  it('ignores a damaged note', () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'unsaved-at-shutdown.json'), '{ nope')
    expect(takeShutdownNote(dir)).toBeNull()
  })
})
