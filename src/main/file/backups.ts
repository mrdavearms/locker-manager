import { join, dirname, basename } from 'node:path'
import { errorCode, type FsPort } from './fsPort'
import { baseName } from './siblings'

// Backups (SPEC.md 6.5): every save keeps the version it replaces, beside the data
// file and in this computer's own app-data folder.

export const BACKUP_FOLDER_NAME = 'Locker Manager backups'

export interface BackupPolicy {
  keepAllDays: number
  dailyDays: number
  maxBytes: number
}

export const DEFAULT_POLICY: BackupPolicy = {
  keepAllDays: 7,
  dailyDays: 92,
  maxBytes: 500 * 1024 * 1024
}

export function sharedBackupDir(dataPath: string): string {
  return join(dirname(dataPath), BACKUP_FOLDER_NAME, baseName(basename(dataPath)))
}

const pad = (n: number, w = 2): string => String(n).padStart(w, '0')

/** "Locker data 2026-10-06 091512" in local time, plus an optional label. Sorts by time. */
export function backupFileName(base: string, at: Date, label?: string): string {
  const stampText = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`
  const safeLabel = label
    ? ` ${label
        .replace(/[\\/:*?"<>|]/g, '-')
        .trim()
        .slice(0, 60)}`
    : ''
  return `${base} ${stampText}${safeLabel}.lockers`
}

export interface BackupEntry {
  name: string
  at: Date
  label: string | null
  size: number
}

/** Reads the time and label back out of a backup file name. */
export function parseBackupName(
  base: string,
  name: string
): { at: Date; label: string | null } | null {
  if (!name.startsWith(`${base} `) || !name.toLowerCase().endsWith('.lockers')) return null
  const rest = name.slice(base.length + 1, -'.lockers'.length)
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2})(\d{2})(\d{2})(?: (.+))?$/.exec(rest)
  if (!m) return null
  const [, y, mo, d, h, mi, s, label] = m
  const at = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))
  if (Number.isNaN(at.getTime())) return null
  return { at, label: label ?? null }
}

const DAY = 24 * 60 * 60 * 1000

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function weekKey(d: Date): number {
  // Whole weeks since a fixed Monday, in local time.
  const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const monday = new Date(2001, 0, 1).getTime()
  return Math.floor(Math.round((midnight - monday) / DAY) / 7)
}

/**
 * Pure: which backups to delete. Keeps everything from the last keepAllDays, the
 * newest of each day up to dailyDays, then the newest of each week. Named
 * backups ("before update to 1.4.0") are kept regardless of age. Then, while over
 * the size cap, deletes the oldest unnamed, then the oldest named. The newest
 * backup is never deleted.
 */
export function planPrune(
  entries: readonly BackupEntry[],
  now: Date,
  policy: BackupPolicy = DEFAULT_POLICY
): string[] {
  const sorted = [...entries].sort((a, b) => b.at.getTime() - a.at.getTime())
  const keep = new Set<string>()
  const seenDays = new Set<string>()
  const seenWeeks = new Set<number>()
  for (const e of sorted) {
    const age = now.getTime() - e.at.getTime()
    if (e.label !== null || age < policy.keepAllDays * DAY) {
      keep.add(e.name)
      continue
    }
    if (age < policy.dailyDays * DAY) {
      const k = localDayKey(e.at)
      if (!seenDays.has(k)) {
        seenDays.add(k)
        keep.add(e.name)
      }
      continue
    }
    const w = weekKey(e.at)
    if (!seenWeeks.has(w)) {
      seenWeeks.add(w)
      keep.add(e.name)
    }
  }
  const newest = sorted[0]?.name
  let total = sorted.filter((e) => keep.has(e.name)).reduce((n, e) => n + e.size, 0)
  const oldestFirst = [...sorted].reverse()
  for (const pass of ['unnamed', 'named'] as const) {
    for (const e of oldestFirst) {
      if (total <= policy.maxBytes) break
      if (!keep.has(e.name) || e.name === newest) continue
      if ((pass === 'unnamed') !== (e.label === null)) continue
      keep.delete(e.name)
      total -= e.size
    }
  }
  return sorted.filter((e) => !keep.has(e.name)).map((e) => e.name)
}

export async function listBackups(fs: FsPort, dir: string, base: string): Promise<BackupEntry[]> {
  let names: string[]
  try {
    names = await fs.readdir(dir)
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return []
    throw error
  }
  const out: BackupEntry[] = []
  for (const name of names) {
    const parsed = parseBackupName(base, name)
    if (!parsed) continue
    try {
      const s = await fs.stat(join(dir, name))
      out.push({ name, at: parsed.at, label: parsed.label, size: s.size })
    } catch {
      // vanished between listing and stat (sync); ignore
    }
  }
  return out.sort((a, b) => b.at.getTime() - a.at.getTime())
}

/** Writes one backup (never overwriting) and prunes the folder. Returns its file name. */
export async function writeBackup(
  fs: FsPort,
  dir: string,
  base: string,
  bytes: Uint8Array,
  at: Date,
  opts: { label?: string; randomSuffix: () => string; policy?: BackupPolicy }
): Promise<string> {
  await fs.mkdirp(dir)
  let name = backupFileName(base, at, opts.label)
  // Two saves in the same second: add a counter rather than overwrite.
  const existing = new Set(await fs.readdir(dir))
  for (let i = 2; existing.has(name); i++) {
    name = backupFileName(base, at, opts.label ? `${opts.label} (${i})` : `(${i})`)
  }
  const tmp = join(dir, `.${name}.tmp-${opts.randomSuffix()}`)
  await fs.writeNewFileDurable(tmp, bytes)
  await fs.rename(tmp, join(dir, name))
  try {
    const all = await listBackups(fs, dir, base)
    for (const doomed of planPrune(all, at, opts.policy)) {
      try {
        await fs.unlink(join(dir, doomed))
      } catch {
        // Synced folders can bring files back; pruning is best effort (SPEC.md 6.3).
      }
    }
  } catch {
    // Pruning never fails a backup.
  }
  return name
}
