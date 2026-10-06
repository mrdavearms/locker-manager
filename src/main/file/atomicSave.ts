import { errorCode, sleep as defaultSleep, type FsPort } from './fsPort'
import { sha256 } from './hash'

export interface SaveRequest {
  fs: FsPort
  path: string
  bytes: Uint8Array
  /**
   * The SHA-256 the file on disk had when we last read or wrote it. null means
   * "the file must not exist yet" (creating a new data file).
   */
  expectedHash: string | null
  /** Unique suffix for the temporary file. */
  randomSuffix: () => string
  /** Keeps the version being replaced. A failure here does not stop the save. */
  backupPrevious?: (previous: Uint8Array) => Promise<void>
  renameAttempts?: number
  renameDelayMs?: number
  sleep?: (ms: number) => Promise<void>
}

export type SaveOutcome =
  | { kind: 'saved'; hash: string; size: number; mtimeMs: number; backupError?: string }
  /** The file on disk is not the version we last saw. Nothing was written. */
  | { kind: 'conflict'; diskHash: string | null }

export class SaveFailedError extends Error {
  constructor(
    message: string,
    readonly step: 'check' | 'write' | 'verify' | 'rename',
    readonly code?: string
  ) {
    super(message)
    this.name = 'SaveFailedError'
  }
}

async function currentDiskHash(
  fs: FsPort,
  path: string
): Promise<{ hash: string | null; bytes: Uint8Array | null }> {
  try {
    const bytes = await fs.readFile(path)
    return { hash: sha256(bytes), bytes }
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return { hash: null, bytes: null }
    throw new SaveFailedError(
      'The file on disk could not be read before saving.',
      'check',
      errorCode(error)
    )
  }
}

// Windows: OneDrive, antivirus or the search indexer can hold the file for a moment.
const RETRYABLE_RENAME = new Set(['EPERM', 'EBUSY', 'EACCES'])

/**
 * Writes the data file without ever leaving a half-written file in its place
 * (SPEC.md 6.1):
 *   1. check the file on disk is still the version we last saw (else: conflict);
 *   2. write a temporary file beside it with a unique name, flushed to disk;
 *   3. read the temporary file back and check its hash;
 *   4. keep the version being replaced as a backup;
 *   5. check the disk version once more, then rename the temporary file over it.
 * A failure at any step leaves the original untouched; the temporary file is
 * removed when possible, and tidied up on a later open if not.
 */
export async function saveAtomically(req: SaveRequest): Promise<SaveOutcome> {
  const { fs, path, bytes } = req
  const sleep = req.sleep ?? defaultSleep
  const wantHash = sha256(bytes)

  // 1
  const disk = await currentDiskHash(fs, path)
  if (disk.hash !== req.expectedHash) return { kind: 'conflict', diskHash: disk.hash }

  // 2
  const tmp = `${path}.tmp-${req.randomSuffix()}`
  const discardTmp = async (): Promise<void> => {
    try {
      await fs.unlink(tmp)
    } catch {
      // Left for the tidy-up on the next open.
    }
  }
  try {
    await fs.writeNewFileDurable(tmp, bytes)
  } catch (error) {
    await discardTmp()
    throw new SaveFailedError('The new version could not be written.', 'write', errorCode(error))
  }

  // 3
  try {
    const readBack = await fs.readFile(tmp)
    if (sha256(readBack) !== wantHash) {
      await discardTmp()
      throw new SaveFailedError(
        'The new version did not read back correctly, so it was not used.',
        'verify'
      )
    }
  } catch (error) {
    if (error instanceof SaveFailedError) throw error
    await discardTmp()
    throw new SaveFailedError(
      'The new version could not be read back to check it.',
      'verify',
      errorCode(error)
    )
  }

  // 4
  let backupError: string | undefined
  if (disk.bytes && req.backupPrevious) {
    try {
      await req.backupPrevious(disk.bytes)
    } catch (error) {
      backupError = error instanceof Error ? error.message : String(error)
    }
  }

  // 5
  let recheck: { hash: string | null }
  try {
    recheck = await currentDiskHash(fs, path)
  } catch (error) {
    await discardTmp()
    throw error
  }
  if (recheck.hash !== req.expectedHash) {
    await discardTmp()
    return { kind: 'conflict', diskHash: recheck.hash }
  }
  const attempts = req.renameAttempts ?? 10
  for (let i = 1; ; i++) {
    try {
      await fs.rename(tmp, path)
      break
    } catch (error) {
      const code = errorCode(error)
      if (i < attempts && code !== undefined && RETRYABLE_RENAME.has(code)) {
        await sleep(req.renameDelayMs ?? 250)
        continue
      }
      await discardTmp()
      throw new SaveFailedError(
        'The file is being held by another program (often OneDrive or antivirus), so the new version could not be put in place. Your changes are safe in the app; it will try again.',
        'rename',
        code
      )
    }
  }

  // The rename has happened: the save succeeded whatever happens next. Reporting a
  // failure here would make the app treat its own save as someone else's change.
  let mtimeMs = Date.now()
  try {
    mtimeMs = (await fs.stat(path)).mtimeMs
  } catch {
    // mtime is only a hint for change polling; the hash is the real record.
  }
  return {
    kind: 'saved',
    hash: wantHash,
    size: bytes.byteLength,
    mtimeMs,
    ...(backupError ? { backupError } : {})
  }
}
