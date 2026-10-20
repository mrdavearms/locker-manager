import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isNewer } from './policy'

// The Windows installer runs after the app has quit and reports nothing back, so
// the app writes down the version it is about to install, and the next start
// compares that with its own version. Without this, an install that could not
// finish (an administrator prompt the person cannot answer, or a security policy
// blocking the installer) was tried again at every start, and the app quit every
// time it was opened (docs/audits/2026-10-20-stability-audit.md, finding 2).
// Electron-free, so the unit tests run it.

const FILE = 'update-attempt.json'

/** Called just before the installer starts. Synchronous: it runs while the app quits. */
export function recordWindowsAttempt(userData: string, version: string, now: Date): void {
  try {
    writeFileSync(join(userData, FILE), JSON.stringify({ version, at: now.toISOString() }))
  } catch {
    // Not knowing about one attempt only means it may be tried once more.
  }
}

/**
 * The version whose install did not finish on this computer, or null. A record
 * that the running version has reached is cleared.
 */
export function failedWindowsAttempt(userData: string, running: string): string | null {
  const file = join(userData, FILE)
  let version: unknown
  try {
    version = (JSON.parse(readFileSync(file, 'utf8')) as { version?: unknown }).version
  } catch {
    return null
  }
  if (typeof version === 'string' && isNewer(running, version)) return version
  try {
    unlinkSync(file)
  } catch {
    // A record left behind is read again next time, with the same answer.
  }
  return null
}

/**
 * Whether this account can create files in `dir`. On Windows, `access()` ignores
 * folder permissions, so this writes and deletes a small file instead.
 */
export async function folderWritable(dir: string): Promise<boolean> {
  const probe = join(dir, `.write-check-${process.pid}`)
  try {
    await writeFile(probe, '', { flag: 'wx' })
  } catch {
    return false
  }
  await unlink(probe).catch(() => undefined)
  return true
}
