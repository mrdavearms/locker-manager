import { basename } from 'node:path'

// Pure checks on the files beside the data file (SPEC.md 6.3).

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function baseName(dataFileName: string): string {
  return dataFileName.replace(/\.lockers$/i, '')
}

/**
 * Copies that sync services and the operating system make of a file:
 *   OneDrive              "Locker data-OFFICE-PC.lockers"
 *   Google Drive, Windows "Locker data (1).lockers"
 *   Dropbox               "Locker data (Dave's conflicted copy 2026-10-06).lockers"
 *   Google Drive          "Locker data (conflict 2026-10-06).lockers"
 *   macOS Finder          "Locker data copy.lockers", "Locker data copy 2.lockers"
 */
export function findConflictCopies(dataFileName: string, siblings: readonly string[]): string[] {
  const base = escapeRegExp(baseName(dataFileName))
  const patterns = [
    new RegExp(`^${base}-.+\\.lockers$`, 'i'),
    new RegExp(`^${base} \\(\\d+\\)\\.lockers$`, 'i'),
    new RegExp(`^${base} \\(.*conflict.*\\)\\.lockers$`, 'i'),
    new RegExp(`^${base} copy( \\d+)?\\.lockers$`, 'i')
  ]
  return siblings
    .filter((name) => name.toLowerCase() !== dataFileName.toLowerCase())
    .filter((name) => patterns.some((p) => p.test(name)))
    .sort()
}

/** Temporary files left behind by an interrupted save or lock write. */
export function leftoverTempFiles(dataFileName: string, siblings: readonly string[]): string[] {
  const prefixes = [`${dataFileName}.tmp-`, `${dataFileName}.lock.tmp-`]
  return siblings.filter((name) => prefixes.some((p) => name.startsWith(p)))
}

export type LocationWarning = 'downloads' | 'temporary' | 'email_attachment' | null

/**
 * Warns when a file is opened from somewhere that suggests a downloaded or
 * attached copy rather than the shared file (SPEC.md section 15, item 11).
 */
export function locationWarning(
  filePath: string,
  env: { home: string; tmpDir: string; platform: NodeJS.Platform }
): LocationWarning {
  const norm = (p: string): string => {
    const s = p.replace(/\\/g, '/')
    return env.platform === 'linux' ? s : s.toLowerCase()
  }
  const p = norm(filePath)
  const under = (dir: string): boolean => {
    const d = norm(dir).replace(/\/$/, '')
    return d.length > 0 && p.startsWith(`${d}/`)
  }
  if (/content\.outlook|\/inetcache\/|outlook temp|com\.microsoft\.outlook/.test(p))
    return 'email_attachment'
  if (under(`${env.home}/Downloads`)) return 'downloads'
  if (
    under(env.tmpDir) ||
    /\/appdata\/local\/temp\//.test(p) ||
    p.startsWith('/tmp/') ||
    p.startsWith('/private/var/folders/')
  ) {
    return 'temporary'
  }
  return null
}

export function locationWarningMessage(
  w: Exclude<LocationWarning, null>,
  filePath: string
): string {
  const name = basename(filePath)
  switch (w) {
    case 'downloads':
      return `"${name}" is in your Downloads folder, so it is probably a downloaded copy. Changes here will not reach the shared file. Open the file in your school's shared folder instead.`
    case 'temporary':
      return `"${name}" is in a temporary folder, so it is probably a copy. Changes here may be lost and will not reach the shared file.`
    case 'email_attachment':
      return `"${name}" looks like an email attachment. Changes here will not reach the shared file.`
  }
}
