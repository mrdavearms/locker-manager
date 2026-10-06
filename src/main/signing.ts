import { execFile } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import log from 'electron-log/main'
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
