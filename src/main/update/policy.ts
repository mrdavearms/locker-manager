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
 * Mac build only tells the operator and opens the download page. Windows
 * installs unsigned updates fine.
 */
export function updateMode(input: {
  platform: NodeJS.Platform
  packaged: boolean
  signed: boolean
}): UpdateMode {
  if (!input.packaged) return 'disabled'
  if (input.platform === 'darwin' && !input.signed) return 'manual-download'
  return 'auto'
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

/** Check 30 seconds after launch, then every 4 hours (SPEC.md 9.3). */
export const CHECK_DELAY_MS = 30_000
export const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000
