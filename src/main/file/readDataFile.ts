import { errorCode, type FsPort } from './fsPort'
import { sha256 } from './hash'
import { checkSqliteBytes } from './sqliteHeader'

export type ReadProblem =
  /** No file at that path. */
  | 'not_found'
  /** Zero bytes or all zeros: a cloud placeholder that has not downloaded (SPEC.md 6.1). */
  | 'not_synced'
  /** Shorter than its own header says: a download still in progress. */
  | 'incomplete'
  /** Not a Locker Manager data file at all. */
  | 'not_a_data_file'
  /** The operating system refused. */
  | 'no_permission'
  /** Some other read failure, often a placeholder that cannot download while offline. */
  | 'unreadable'

export type ReadResult =
  | { ok: true; bytes: Uint8Array; hash: string; size: number; mtimeMs: number }
  | { ok: false; problem: ReadProblem; detail?: string }

/** Reads the whole file and checks it is a complete SQLite database. */
export async function readDataFile(fs: FsPort, path: string): Promise<ReadResult> {
  let bytes: Uint8Array
  let mtimeMs: number
  try {
    const before = await fs.stat(path)
    bytes = await fs.readFile(path)
    mtimeMs = before.mtimeMs
  } catch (error) {
    const code = errorCode(error)
    if (code === 'ENOENT') return { ok: false, problem: 'not_found' }
    if (code === 'EACCES' || code === 'EPERM') return { ok: false, problem: 'no_permission' }
    return { ok: false, problem: 'unreadable', detail: code ?? String(error) }
  }
  const verdict = checkSqliteBytes(bytes)
  if (verdict === 'empty') return { ok: false, problem: 'not_synced' }
  if (verdict === 'incomplete') return { ok: false, problem: 'incomplete' }
  if (verdict === 'not_sqlite') return { ok: false, problem: 'not_a_data_file' }
  return { ok: true, bytes, hash: sha256(bytes), size: bytes.byteLength, mtimeMs }
}

/** Plain-language explanation for each problem, shown to the operator. */
export function readProblemMessage(problem: ReadProblem): string {
  switch (problem) {
    case 'not_found':
      return 'The file is not there any more. It may have been moved, renamed or deleted.'
    case 'not_synced':
    case 'incomplete':
      return 'This file has not finished syncing to this computer. Wait a minute, then try again. If it keeps happening, open OneDrive (or your sync app) and check it is running.'
    case 'not_a_data_file':
      return 'This is not a Locker Manager data file, or it is damaged. Try a backup from the "Locker Manager backups" folder beside it.'
    case 'no_permission':
      return 'This computer is not allowed to open that file. Ask whoever manages the shared folder to give you access.'
    case 'unreadable':
      return 'The file could not be read. If it is in OneDrive, check this computer is online and OneDrive is running, then try again.'
  }
}
