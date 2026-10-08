import semver from 'semver'
import type { UpdateMode } from '@shared/ipc'

// Pure decision rules for the updater. No Electron imports, so Vitest covers them.

/**
 * Milestone builds are GitHub pre-releases. electron-updater ignores pre-releases
 * unless told otherwise, so every 0.x build accepts them. From 1.0.0 only
 * normal releases are taken, unless the running version itself is a beta
 * (1.3.0-beta.2), which then follows the beta channel.
 */
export function allowPrerelease(version: string): boolean {
  const v = semver.parse(version)
  if (v === null) return false
  return v.major === 0 || v.prerelease.length > 0
}

/** True when `candidate` is a newer version than `current`. */
export function isNewer(current: string, candidate: string): boolean {
  if (!semver.valid(current) || !semver.valid(candidate)) return false
  return semver.gt(candidate, current)
}

/**
 * Reads the output of `codesign -dv --verbose=2 <app>` and says whether the app
 * carries a Developer ID signature. An ad-hoc signature (what CI applies while
 * there is no certificate) prints `Signature=adhoc` and no Authority lines.
 */
export function isDeveloperIdSigned(codesignOutput: string): boolean {
  if (/^Signature=adhoc$/m.test(codesignOutput)) return false
  return /^Authority=Developer ID Application:/m.test(codesignOutput)
}

/**
 * Squirrel.Mac refuses to install an update whose signature does not match the
 * running app, and an ad-hoc signature differs on every build. So an unsigned
 * Mac build installs updates itself instead (src/main/update/macInstaller.ts):
 * it downloads the ZIP, checks it, and swaps the app bundle after quitting.
 * Where macOS will not let it swap the bundle (`macBlocker`), it only tells the
 * operator and opens the download page. Windows installs unsigned updates fine.
 */
export function updateMode(input: {
  platform: NodeJS.Platform
  packaged: boolean
  signed: boolean
  /** Unsigned Mac only: why the app cannot replace itself, or null if it can. */
  macBlocker?: string | null
}): UpdateMode {
  if (!input.packaged) return 'disabled'
  if (input.platform === 'darwin' && !input.signed && input.macBlocker !== null) {
    return 'manual-download'
  }
  return 'auto'
}

/**
 * Why an unsigned Mac copy cannot replace its own app bundle, in words for staff,
 * or null when it can. `writable` is whether this Mac account may change the
 * folder that holds the app and the app itself.
 */
export function macBlocker(bundlePath: string, writable: boolean): string | null {
  if (!bundlePath.endsWith('.app')) {
    return 'Locker Manager could not work out where it is installed.'
  }
  if (bundlePath.includes('/AppTranslocation/')) {
    return 'Locker Manager is running from the folder it was downloaded to, so macOS will not let it update itself. Quit it, drag Locker Manager into Applications, and open it from there. After that it updates itself.'
  }
  if (bundlePath.startsWith('/Volumes/')) {
    return 'Locker Manager is running from the disk image. Quit it, drag Locker Manager into Applications, and open it from there. After that it updates itself.'
  }
  if (!writable) {
    return 'This Mac account is not allowed to change the Applications folder, so Locker Manager cannot replace itself. Install the new version from the download page, or ask your IT team.'
  }
  return null
}

/** The Mac ZIP among a release's files (the updater's copy, not the DMG). */
export function macZipFile<T extends { url: string }>(files: readonly T[]): T | undefined {
  return (
    files.find((f) => /universal\.zip$/i.test(f.url)) ?? files.find((f) => /\.zip$/i.test(f.url))
  )
}

/**
 * Address of one release file. electron-updater gives GitHub file names relative
 * to the release's download folder.
 */
export function releaseFileUrl(repoUrl: string, version: string, file: string): string {
  if (/^https:\/\//i.test(file)) return file
  return `${repoUrl.replace(/\/$/, '')}/releases/download/v${version}/${encodeURIComponent(file)}`
}

/**
 * Updates found when the app starts install straight away, before anyone starts
 * work: only while no file has been opened since launch, the operator has not
 * pressed Skip, and nothing is running.
 */
export function installAtStartup(input: {
  startup: boolean
  fileOpenedSinceLaunch: boolean
  skipped: boolean
}): boolean {
  return input.startup && !input.fileOpenedSinceLaunch && !input.skipped
}

export function releasePageUrl(repoUrl: string, version: string): string {
  return `${repoUrl.replace(/\/$/, '')}/releases/tag/v${version}`
}

/** Things that must never be interrupted by an update restart (SPEC.md 9.3). */
export interface BusyState {
  saving: boolean
  printing: boolean
  importing: boolean
  unsavedChanges: boolean
}

export function installBlockedReason(busy: BusyState): string | null {
  if (busy.saving) return 'A save is still running. Try again in a moment.'
  if (busy.printing) return 'A print job is still running. Wait for it to finish first.'
  if (busy.importing) return 'An import is still running. Wait for it to finish first.'
  if (busy.unsavedChanges) return 'There are unsaved changes. Save or discard them first.'
  return null
}

/**
 * Check 3 seconds after launch (Dave, 9 Oct 2026: SPEC.md 9.3 said 30 seconds, but an
 * update found before work starts installs straight away), then every 4 hours.
 */
export const CHECK_DELAY_MS = 3_000
export const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000
