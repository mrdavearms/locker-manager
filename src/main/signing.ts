import { execFile } from 'node:child_process'
import { open } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import log from 'electron-log/main'
import { hasAuthenticodeSignature, PE_HEADER_BYTES } from './peSignature'
import { isDeveloperIdSigned } from './update/policy'

/** Path of the .app bundle this process runs from (macOS only). */
export function macAppBundlePath(execPath: string): string {
  // <bundle>.app/Contents/MacOS/<binary>
  return resolve(dirname(execPath), '..', '..')
}

/**
 * Asks macOS whether the running app is signed with a Developer ID. Resolves
 * false on any failure, which is the safe answer: the updater then falls back
 * to "open the download page" rather than attempting an install that
 * Squirrel.Mac would reject.
 */
export function detectDeveloperIdSignature(execPath: string): Promise<boolean> {
  return new Promise((resolveSigned) => {
    execFile(
      '/usr/bin/codesign',
      ['-dv', '--verbose=2', macAppBundlePath(execPath)],
      { timeout: 5000 },
      (error, stdout, stderr) => {
        if (error) {
          log.info('codesign check failed; treating app as unsigned', error.message)
          resolveSigned(false)
          return
        }
        // codesign writes its report to stderr.
        resolveSigned(isDeveloperIdSigned(`${stdout}\n${stderr}`))
      }
    )
  })
}

/**
 * Says whether the running Windows .exe carries an Authenticode signature, by
 * reading the first few kilobytes of the file (no PowerShell, so it is instant).
 * Resolves false on any failure.
 */
export async function detectWindowsSignature(execPath: string): Promise<boolean> {
  try {
    const file = await open(execPath, 'r')
    try {
      const head = new Uint8Array(PE_HEADER_BYTES)
      const { bytesRead } = await file.read(head, 0, PE_HEADER_BYTES, 0)
      return hasAuthenticodeSignature(head.subarray(0, bytesRead))
    } finally {
      await file.close()
    }
  } catch (error) {
    log.info('signature check failed; treating app as unsigned', String(error))
    return false
  }
}
