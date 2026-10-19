import { promises, rmSync } from 'original-fs'

// Every delete in the main process goes through here (an ESLint rule enforces it).
// Electron's fs treats a .asar file as a folder, so a recursive rm of a folder
// holding a downloaded app fails with ENOTEMPTY. original-fs is Electron's copy
// of Node's fs without that behaviour. 0.11.0 to 0.11.3 used the plain rm and
// every Mac that had updated itself once could not update again.

/** Removes a file or folder and everything inside it. */
export function removeTree(path: string): Promise<void> {
  return promises.rm(path, { recursive: true, force: true })
}

/** Synchronous `removeTree`, for code that runs while the app quits. */
export function removeTreeSync(path: string): void {
  rmSync(path, { recursive: true, force: true })
}
