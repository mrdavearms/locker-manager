import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// When Windows shut down before the last changes could be saved, they are kept as a
// backup on this computer. This note tells the person at the next start, so the
// changes are not quietly missing (docs/audits/2026-10-20-stability-audit.md, finding 7).

const FILE = 'unsaved-at-shutdown.json'

export interface ShutdownNote {
  path: string
  backup: string | null
  at: string
}

/** Synchronous: runs while Windows is ending the session. */
export function writeShutdownNote(userData: string, note: ShutdownNote): void {
  try {
    writeFileSync(join(userData, FILE), JSON.stringify(note))
  } catch {
    // nothing more can be done in the time left
  }
}

/** The note left by the last shutdown, read once. */
export function takeShutdownNote(userData: string): ShutdownNote | null {
  const file = join(userData, FILE)
  try {
    const note = JSON.parse(readFileSync(file, 'utf8')) as Partial<ShutdownNote>
    unlinkSync(file)
    if (typeof note.path !== 'string' || typeof note.at !== 'string') return null
    return {
      path: note.path,
      backup: typeof note.backup === 'string' ? note.backup : null,
      at: note.at
    }
  } catch {
    return null
  }
}

/** The message for the person, in plain words. */
export function shutdownNoteMessage(note: ShutdownNote): string {
  const kept = note.backup
    ? `They are kept as a backup on this computer named "${note.backup}". Open the file, then Backups, to get them back.`
    : 'No backup of them could be written in the time Windows allowed.'
  return `Windows shut down before Locker Manager could save your last changes to ${note.path}. ${kept}`
}
