import { join, dirname, basename } from 'node:path'
import { promisify } from 'node:util'
import { gunzip, gzip } from 'node:zlib'
import { errorCode, type FsPort } from './fsPort'
import { readDataFile, type ReadResult } from './readDataFile'
import { baseName } from './siblings'

// Backups (SPEC.md 6.5): every save keeps the version it replaces, beside the data
// file and in this computer's own app-data folder. New backups are compressed with
// gzip (".lockers.gz", about a third of the size); backups kept by 0.11.0 and
// earlier are plain ".lockers" copies, and both are read.

export const BACKUP_FOLDER_NAME = 'Locker Manager backups'

const PLAIN_EXT = '.lockers'
const COMPRESSED_EXT = '.lockers.gz'

export interface BackupPolicy {
  /** Every backup younger than this is kept. */
  keepAllDays: number
  /** Then one an hour until this age (equal to keepAllDays: no hourly stage). */
  hourlyDays: number
  /** Then one a day until this age, which is how far back the rules promise; then one a week. */
  dailyDays: number
  maxBytes: number
}

export const DEFAULT_POLICY: BackupPolicy = {
  keepAllDays: 1,
  hourlyDays: 7,
  dailyDays: 99,
  maxBytes: 500 * 1024 * 1024
}

export function sharedBackupDir(dataPath: string): string {
  return join(dirname(dataPath), BACKUP_FOLDER_NAME, baseName(basename(dataPath)))
}

const pad = (n: number, w = 2): string => String(n).padStart(w, '0')

/**
 * "Locker data 2026-10-06 091512.lockers.gz" in local time, plus an optional label.
 * Sorts by time. `compressed: false` gives the older plain name.
 */
export function backupFileName(
  base: string,
  at: Date,
  label?: string,
  opts: { compressed?: boolean } = {}
): string {
  const stampText = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`
  const safeLabel = label
    ? ` ${label
        .replace(/[\\/:*?"<>|]/g, '-')
        .trim()
        .slice(0, 60)}`
    : ''
  return `${base} ${stampText}${safeLabel}${opts.compressed === false ? PLAIN_EXT : COMPRESSED_EXT}`
}

/** A backup's file name without ".lockers" or ".lockers.gz". */
export function backupStem(name: string): string {
  return name.replace(/\.lockers(\.gz)?$/i, '')
}

export interface BackupEntry {
  name: string
  at: Date
  label: string | null
  size: number
}

/** Reads the time and label back out of a backup file name (compressed or plain). */
export function parseBackupName(
  base: string,
  name: string
): { at: Date; label: string | null } | null {
  if (!name.startsWith(`${base} `) || !/\.lockers(\.gz)?$/i.test(name)) return null
  const rest = backupStem(name).slice(base.length + 1)
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2})(\d{2})(\d{2})(?: (.+))?$/.exec(rest)
  if (!m) return null
  const [, y, mo, d, h, mi, s, label] = m
  const at = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))
  if (Number.isNaN(at.getTime())) return null
  return { at, label: label ?? null }
}

const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000

function localHourKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`
}

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
 * newest of each hour up to hourlyDays, the newest of each day up to dailyDays, then
 * the newest of each week. Hours sit inside days and days inside weeks, so running
 * this after every save keeps the newest save of each hour, then of each day.
 * Named backups ("before update to 1.4.0") are kept regardless of age.
 *
 * Then, while over the size cap: deletes the weekly backups older than the promise
 * (oldest first), thins recent bursts (older than an hour) to one per 10 minutes,
 * then deletes the oldest unnamed, then the oldest named. The newest backup is
 * never deleted.
 */
export function planPrune(
  entries: readonly BackupEntry[],
  now: Date,
  policy: BackupPolicy = DEFAULT_POLICY
): string[] {
  const sorted = [...entries].sort((a, b) => b.at.getTime() - a.at.getTime())
  const keep = new Set<string>()
  const seenHours = new Set<string>()
  const seenDays = new Set<string>()
  const seenWeeks = new Set<number>()
  const firstIn = <K>(seen: Set<K>, k: K): boolean => {
    if (seen.has(k)) return false
    seen.add(k)
    return true
  }
  for (const e of sorted) {
    const age = now.getTime() - e.at.getTime()
    let kept: boolean
    if (e.label !== null || age < policy.keepAllDays * DAY) kept = true
    else if (age < policy.hourlyDays * DAY) kept = firstIn(seenHours, localHourKey(e.at))
    else if (age < policy.dailyDays * DAY) kept = firstIn(seenDays, localDayKey(e.at))
    else kept = firstIn(seenWeeks, weekKey(e.at))
    if (kept) keep.add(e.name)
  }
  const newest = sorted[0]?.name
  let total = sorted.filter((e) => keep.has(e.name)).reduce((n, e) => n + e.size, 0)
  const oldestFirst = [...sorted].reverse()
  const drop = (e: BackupEntry): void => {
    keep.delete(e.name)
    total -= e.size
  }
  // Over the cap: first the weekly backups older than the rules promise.
  for (const e of oldestFirst) {
    if (total <= policy.maxBytes) break
    if (!keep.has(e.name) || e.label !== null || e.name === newest) continue
    if (now.getTime() - e.at.getTime() >= policy.dailyDays * DAY) drop(e)
  }
  // Then thin bursts of recent saves to one per 10 minutes (keeping the last hour
  // whole), so a busy day never pushes out weeks of history.
  if (total > policy.maxBytes) {
    const seenSlots = new Set<number>()
    for (const e of sorted) {
      if (total <= policy.maxBytes) break
      if (!keep.has(e.name) || e.label !== null || e.name === newest) continue
      const age = now.getTime() - e.at.getTime()
      if (age < HOUR || age >= policy.keepAllDays * DAY) continue
      if (!firstIn(seenSlots, Math.floor(e.at.getTime() / (10 * 60 * 1000)))) drop(e)
    }
  }
  for (const pass of ['unnamed', 'named'] as const) {
    for (const e of oldestFirst) {
      if (total <= policy.maxBytes) break
      if (!keep.has(e.name) || e.name === newest) continue
      if ((pass === 'unnamed') !== (e.label === null)) continue
      drop(e)
    }
  }
  return sorted.filter((e) => !keep.has(e.name)).map((e) => e.name)
}

/**
 * Pure: how far back one backups folder reaches. Short means the size limit is
 * cutting backups off before the promised days: the folder is full (one more backup
 * like the newest would not fit) and the oldest backup taken on save is younger than
 * dailyDays. Named backups are left out: they do not cover everyday changes.
 */
export function backupReach(
  entries: readonly BackupEntry[],
  now: Date,
  policy: BackupPolicy
): { oldest: Date | null; promisedDays: number; short: boolean } {
  const promisedDays = policy.dailyDays
  const everyday = entries.filter((e) => e.label === null)
  if (everyday.length === 0) return { oldest: null, promisedDays, short: false }
  const oldest = new Date(Math.min(...everyday.map((e) => e.at.getTime())))
  const newest = entries.reduce((a, b) => (a.at > b.at ? a : b))
  const total = entries.reduce((n, e) => n + e.size, 0)
  const full = total + newest.size > policy.maxBytes
  const short = full && now.getTime() - oldest.getTime() < promisedDays * DAY
  return { oldest, promisedDays, short }
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

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

const CHUNKS = 4
const MIN_CHUNK = 1024 * 1024

/**
 * Compresses a backup. Node runs gzip on its worker threads, so the window stays
 * responsive. A large file is cut into up to four pieces compressed at the same
 * time and joined: a gzip file may hold several parts one after another, and every
 * gzip reader (Node, 7-Zip, macOS) reads them as one. Level 1 is the fastest and on
 * a real file almost as small as the default (about 3 to 1 either way, measured
 * 9 October 2026).
 */
export async function compressBackup(bytes: Uint8Array): Promise<Uint8Array> {
  const size = Math.max(MIN_CHUNK, Math.ceil(bytes.byteLength / CHUNKS))
  const pieces: Uint8Array[] = []
  for (let at = 0; at < bytes.byteLength || at === 0; at += size)
    pieces.push(bytes.subarray(at, at + size))
  const parts = await Promise.all(pieces.map((p) => gzipAsync(p, { level: 1 })))
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0))
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.byteLength
  }
  return out
}

/** Undoes compressBackup when the bytes start with the gzip signature; null if damaged. */
async function decodeBackup(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (bytes.byteLength < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes
  try {
    const out = await gunzipAsync(bytes)
    return new Uint8Array(out.buffer, out.byteOffset, out.byteLength)
  } catch {
    return null
  }
}

/** Reads a backup, compressed or plain, and checks it is a complete data file. */
export async function readBackupFile(fs: FsPort, path: string): Promise<ReadResult> {
  return readDataFile(fs, path, decodeBackup)
}

/**
 * Writes one backup (never overwriting) and prunes the folder. Returns its file
 * name. `compressed` says the bytes are already gzip (compressBackup); the name then
 * ends ".lockers.gz".
 */
export async function writeBackup(
  fs: FsPort,
  dir: string,
  base: string,
  bytes: Uint8Array,
  at: Date,
  opts: { label?: string; randomSuffix: () => string; policy?: BackupPolicy; compressed?: boolean }
): Promise<string> {
  await fs.mkdirp(dir)
  const nameOpts = { compressed: opts.compressed ?? false }
  let name = backupFileName(base, at, opts.label, nameOpts)
  // Two saves in the same second: add a counter rather than overwrite.
  const existing = new Set(await fs.readdir(dir))
  for (let i = 2; existing.has(name); i++) {
    name = backupFileName(base, at, opts.label ? `${opts.label} (${i})` : `(${i})`, nameOpts)
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
