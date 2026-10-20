import { z } from 'zod'
import { errorCode, sleep, type FsPort } from './fsPort'

// The edit lock (SPEC.md 6.2). Advisory: the hash check in atomicSave is the real
// protection. It tells everyone else who is editing, and lets a crashed session's
// lock be taken over once its heartbeat goes stale.

export const LockInfoSchema = z.object({
  format: z.literal(1),
  sessionId: z.string().min(1),
  operator: z.string(),
  computer: z.string(),
  appVersion: z.string(),
  pid: z.number().int(),
  startedAt: z.string(),
  heartbeatAt: z.string()
})
export type LockInfo = z.infer<typeof LockInfoSchema>

export const HEARTBEAT_MS = 60_000
export const STALE_AFTER_MS = 10 * 60_000
/** A lock watched unchanged this long has missed two heartbeats or more. */
export const QUIET_MS = 150_000
/** A heartbeat this old is stale whatever the clocks: no two computers are an hour apart. */
export const LONG_STALE_MS = 60 * 60_000

export function lockPathFor(dataPath: string): string {
  return `${dataPath}.lock`
}

export type LockRead = { kind: 'none' } | { kind: 'ok'; info: LockInfo } | { kind: 'corrupt' }

export async function readLock(fs: FsPort, lockPath: string): Promise<LockRead> {
  // A sync service or antivirus can hold the file for a moment (EBUSY, EACCES):
  // try again before calling it damaged (stability audit, finding 10).
  let bytes: Uint8Array | null = null
  for (let attempt = 1; bytes === null; attempt++) {
    try {
      bytes = await fs.readFile(lockPath)
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return { kind: 'none' }
      if (attempt >= 3) return { kind: 'corrupt' }
      await sleep(200)
    }
  }
  const text = new TextDecoder().decode(bytes)
  try {
    const parsed = LockInfoSchema.safeParse(JSON.parse(text))
    return parsed.success ? { kind: 'ok', info: parsed.data } : { kind: 'corrupt' }
  } catch {
    // Often a lock file that has not finished syncing.
    return { kind: 'corrupt' }
  }
}

export type LockClass = 'free' | 'mine' | 'held' | 'stale'

/** Who is asking, so a lock left by this person's own crashed copy can be recognised. */
export interface LockHere {
  operator: string
  computer: string
  processAlive: (pid: number) => boolean
}

/** Whether a process is running on this computer. EPERM means it runs as another user. */
export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return errorCode(error) === 'EPERM'
  }
}

/**
 * What this computer has seen of a lock: `key` names its exact contents, `sinceMs`
 * is when this computer first saw them, by its own clock.
 */
export interface LockSeen {
  key: string
  sinceMs: number
}

/** The key a lock read is watched by: it changes with every heartbeat. */
export function lockKey(read: LockRead): string {
  if (read.kind === 'ok') return `${read.info.sessionId}|${read.info.heartbeatAt}`
  return read.kind
}

/** Records a lock read: the same contents keep the time first seen. */
export function observeLock(prev: LockSeen | null, read: LockRead, nowMs: number): LockSeen {
  const key = lockKey(read)
  return prev && prev.key === key ? prev : { key, sinceMs: nowMs }
}

/**
 * Pure: what a lock means to this session at this moment. With `seen`, staleness
 * also rests on this computer's own clock: the heartbeat is written by the other
 * computer's clock, and the two can differ (stability audit, finding 10). Without
 * `seen`, only the times are compared.
 */
export function classifyLock(
  read: LockRead,
  mySessionId: string,
  now: Date,
  staleAfterMs = STALE_AFTER_MS,
  here?: LockHere,
  seen?: LockSeen | null
): LockClass {
  if (read.kind === 'none') return 'free'
  const watched = seen && seen.key === lockKey(read) ? now.getTime() - seen.sinceMs : 0
  if (read.kind === 'corrupt') {
    // Often a lock file still syncing: damaged only if it stays that way.
    if (!seen) return 'stale'
    return watched >= QUIET_MS ? 'stale' : 'held'
  }
  if (read.info.sessionId === mySessionId) return 'mine'
  // The same person on the same computer, and the copy that wrote it has stopped (a
  // crash, a force-quit, a power cut): it is theirs to carry on with, not a lock to
  // wait 10 minutes for (docs/audits/2026-10-20-stability-audit.md, finding 7).
  if (
    here &&
    read.info.computer === here.computer &&
    read.info.operator === here.operator &&
    !here.processAlive(read.info.pid)
  )
    return 'free'
  // Unchanged for the whole stale time by this computer's clock: the editor has
  // stopped, even if its clock ran fast and its heartbeat looks recent.
  if (watched >= staleAfterMs) return 'stale'
  const beat = Date.parse(read.info.heartbeatAt)
  if (Number.isNaN(beat)) return seen ? 'held' : 'stale'
  const age = now.getTime() - beat
  // A heartbeat far in the future (a wrong clock) is treated as fresh: never steal on a guess.
  if (!seen) return age > staleAfterMs ? 'stale' : 'held'
  if (age > LONG_STALE_MS) return 'stale'
  // Looks stale, but the editor's clock may be slow: only once it has also stayed
  // the same here for longer than two heartbeats.
  return age > staleAfterMs && watched >= QUIET_MS ? 'stale' : 'held'
}

async function writeLock(
  fs: FsPort,
  lockPath: string,
  info: LockInfo,
  suffix: string
): Promise<void> {
  const tmp = `${lockPath}.tmp-${suffix}`
  await fs.writeNewFileDurable(tmp, new TextEncoder().encode(JSON.stringify(info, null, 2)))
  try {
    await fs.rename(tmp, lockPath)
  } catch (error) {
    try {
      await fs.unlink(tmp)
    } catch {
      // tidied later
    }
    throw error
  }
}

export type AcquireResult =
  | { result: 'acquired' }
  | { result: 'held'; info: LockInfo | null }
  | { result: 'stale'; info: LockInfo | null }

export interface LockDeps {
  fs: FsPort
  lockPath: string
  me: LockInfo
  now: () => Date
  randomSuffix: () => string
  processAlive?: (pid: number) => boolean
  /** What this computer has seen of the lock so far (observeLock). */
  seen?: LockSeen | null
}

function hereOf(d: LockDeps): LockHere | undefined {
  return d.processAlive
    ? { operator: d.me.operator, computer: d.me.computer, processAlive: d.processAlive }
    : undefined
}

/** Takes the lock if it is free (or already ours). Never takes a held or stale lock. */
export async function acquireLock(d: LockDeps): Promise<AcquireResult> {
  const existing = await readLock(d.fs, d.lockPath)
  const cls = classifyLock(existing, d.me.sessionId, d.now(), STALE_AFTER_MS, hereOf(d), d.seen)
  if (cls === 'held') return { result: 'held', info: existing.kind === 'ok' ? existing.info : null }
  if (cls === 'stale')
    return { result: 'stale', info: existing.kind === 'ok' ? existing.info : null }
  await writeLock(
    d.fs,
    d.lockPath,
    { ...d.me, heartbeatAt: d.now().toISOString() },
    d.randomSuffix()
  )
  // Read back: on a shared folder someone else may have written theirs at the same moment.
  const confirm = await readLock(d.fs, d.lockPath)
  if (confirm.kind === 'ok' && confirm.info.sessionId === d.me.sessionId)
    return { result: 'acquired' }
  if (confirm.kind === 'ok') return { result: 'held', info: confirm.info }
  return { result: 'stale', info: null }
}

/** Overwrites whatever lock is there with ours. The caller has warned and logged. */
export async function takeOverLock(d: LockDeps): Promise<void> {
  await writeLock(
    d.fs,
    d.lockPath,
    { ...d.me, heartbeatAt: d.now().toISOString() },
    d.randomSuffix()
  )
}

export type HeartbeatResult = { result: 'ok' } | { result: 'lost'; info: LockInfo | null }

/** Refreshes our heartbeat, or reports that someone else now holds the lock. */
export async function heartbeat(d: LockDeps): Promise<HeartbeatResult> {
  const existing = await readLock(d.fs, d.lockPath)
  if (existing.kind === 'ok' && existing.info.sessionId !== d.me.sessionId)
    return { result: 'lost', info: existing.info }
  // Missing or corrupt (a sync hiccup): write ours again.
  await writeLock(
    d.fs,
    d.lockPath,
    { ...d.me, heartbeatAt: d.now().toISOString() },
    d.randomSuffix()
  )
  return { result: 'ok' }
}

/** Removes the lock if it is still ours. */
export async function releaseLock(d: Pick<LockDeps, 'fs' | 'lockPath' | 'me'>): Promise<void> {
  const existing = await readLock(d.fs, d.lockPath)
  if (existing.kind === 'ok' && existing.info.sessionId === d.me.sessionId) {
    try {
      await d.fs.unlink(d.lockPath)
    } catch {
      // A stale lock is harmless: it can be taken over.
    }
  }
}
