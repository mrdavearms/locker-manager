import { basename, dirname, join } from 'node:path'
import { LockerDb } from '../db/db'
import { saveAtomically } from './atomicSave'
import {
  BACKUP_FOLDER_NAME,
  compressBackup,
  readBackupFile,
  sharedBackupDir,
  writeBackup
} from './backups'
import { errorCode, type FsPort } from './fsPort'
import { sha256 } from './hash'
import { classifyLock, lockPathFor, readLock } from './lockFile'
import { readProblemMessage } from './readDataFile'
import { carryAppendOnly, keepPrivacy } from './carryForward'
import { baseName } from './siblings'

// Opening a backup when the school's file will not open. A damaged file used to
// say "open a backup", but the app could not open the compressed backups and its
// Backups screen needs a file already open
// (docs/audits/2026-10-20-stability-audit.md, finding 5). Electron-free.

/**
 * Where the file a backup came from would be: a backup kept beside the data file
 * sits in "<folder>/Locker Manager backups/<name>/". Null for any other place.
 */
export function originalFor(backupPath: string): string | null {
  const nameFolder = dirname(backupPath)
  const backupsFolder = dirname(nameFolder)
  if (basename(backupsFolder) !== BACKUP_FOLDER_NAME) return null
  return join(dirname(backupsFolder), `${basename(nameFolder)}.lockers`)
}

export type RestoreResult = { ok: true } | { ok: false; message: string }

/**
 * Checks the backup is a whole Locker Manager file, keeps whatever is at `target`
 * as a backup beside it, then writes the backup there. Nothing is changed unless
 * every check passes.
 */
export async function restoreBackupFile(
  fs: FsPort,
  backupPath: string,
  target: string,
  ctx: { now: () => Date; randomSuffix: () => string; sessionId: string }
): Promise<RestoreResult> {
  const read = await readBackupFile(fs, backupPath)
  if (!read.ok) return { ok: false, message: readProblemMessage(read.problem) }
  let db: LockerDb
  try {
    db = await LockerDb.fromBytes(read.bytes)
  } catch {
    return { ok: false, message: readProblemMessage('not_a_data_file') }
  }
  try {
    const problems = db.integrityProblems()
    if (problems.length > 0)
      return { ok: false, message: 'That backup is damaged too. Choose an earlier one.' }
    if (!db.get("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'school'"))
      return { ok: false, message: readProblemMessage('not_a_data_file') }
  } finally {
    db.close()
  }

  const lock = await readLock(fs, lockPathFor(target))
  if (lock.kind === 'ok' && classifyLock(lock, ctx.sessionId, ctx.now()) === 'held')
    return {
      ok: false,
      message: `${lock.info.operator} on ${lock.info.computer} is editing that file. Choose another place for the restored file, or ask them to close it first.`
    }

  // Whatever is there now, damaged or not, is kept before it is replaced.
  let existing: Uint8Array | null = null
  try {
    existing = await fs.readFile(target)
  } catch (error) {
    if (errorCode(error) !== 'ENOENT')
      return {
        ok: false,
        message: 'The file already there could not be read, so it was not replaced.'
      }
  }
  if (existing) {
    try {
      await writeBackup(
        fs,
        sharedBackupDir(target),
        baseName(basename(target)),
        await compressBackup(existing),
        ctx.now(),
        {
          label: 'set aside when a backup was restored',
          randomSuffix: ctx.randomSuffix,
          compressed: true
        }
      )
    } catch {
      return {
        ok: false,
        message:
          'A copy of the file already there could not be kept, so it was not replaced. Choose another place for the restored file.'
      }
    }
  }
  const bytes = existing ? await keepFromCurrent(existing, read.bytes) : read.bytes
  try {
    const out = await saveAtomically({
      fs,
      path: target,
      bytes,
      expectedHash: existing ? sha256(existing) : null,
      randomSuffix: ctx.randomSuffix
    })
    if (out.kind !== 'saved')
      return { ok: false, message: 'That file changed while this was happening. Try again.' }
  } catch (error) {
    return {
      ok: false,
      message: `The restored file could not be written (${error instanceof Error ? error.message : String(error)}).`
    }
  }
  return { ok: true }
}

/**
 * When the file being replaced can still be read, the restored version keeps its PIN
 * and every history and reveal line written since the backup (carryForward.ts), as
 * restoring from the Backups screen does. A damaged file gives nothing to keep.
 */
async function keepFromCurrent(existing: Uint8Array, backup: Uint8Array): Promise<Uint8Array> {
  let current: LockerDb
  try {
    current = await LockerDb.fromBytes(existing)
  } catch {
    return backup
  }
  try {
    if (
      current.integrityProblems().length > 0 ||
      !current.get("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'settings'")
    )
      return backup
    const restored = await LockerDb.fromBytes(backup)
    try {
      restored.run('PRAGMA foreign_keys = OFF')
      restored.transaction(() => {
        carryAppendOnly(current, restored)
        keepPrivacy(current, restored)
      })
      return restored.export()
    } catch {
      return backup
    } finally {
      restored.close()
    }
  } catch {
    return backup
  } finally {
    current.close()
  }
}
