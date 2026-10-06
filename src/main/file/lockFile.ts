import { z } from 'zod'
import { errorCode, type FsPort } from './fsPort'

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

export function lockPathFor(dataPath: string): string {
  return `${dataPath}.lock`
}

export type LockRead = { kind: 'none' } | { kind: 'ok'; info: LockInfo } | { kind: 'corrupt' }

export async function readLock(fs: FsPort, lockPath: string): Promise<LockRead> {
  let text: string
  try {
    text = new TextDecoder().decode(await fs.readFile(lockPath))
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return { kind: 'none' }
    return { kind: 'corrupt' }
  }
  try {
    const parsed = LockInfoSchema.safeParse(JSON.parse(text))
    return parsed.success ? { kind: 'ok', info: parsed.data } : { kind: 'corrupt' }
  } catch {
    // Often a lock file that has not finished syncing.
    return { kind: 'corrupt' }
  }
}

export type LockClass = 'free' | 'mine' | 'held' | 'stale'

/** Pure: what a lock means to this session at this moment. */
export function classifyLock(
  read: LockRead,
  mySessionId: string,
  now: Date,
  staleAfterMs = STALE_AFTER_MS
): LockClass {
  if (read.kind === 'none') return 'free'
  if (read.kind === 'corrupt') return 'stale'
  if (read.info.sessionId === mySessionId) return 'mine'
  const beat = Date.parse(read.info.heartbeatAt)
  if (Number.isNaN(beat)) return 'stale'
  // A heartbeat far in the future (a wrong clock) is treated as fresh: never steal on a guess.
  return now.getTime() - beat > staleAfterMs ? 'stale' : 'held'
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
  | { result: 'held'; info: LockInfo }
  | { result: 'stale'; info: LockInfo | null }

export interface LockDeps {
  fs: FsPort
  lockPath: string
  me: LockInfo
  now: () => Date
  randomSuffix: () => string
}

/** Takes the lock if it is free (or already ours). Never takes a held or stale lock. */
export async function acquireLock(d: LockDeps): Promise<AcquireResult> {
  const existing = await readLock(d.fs, d.lockPath)
  const cls = classifyLock(existing, d.me.sessionId, d.now())
  if (cls === 'held' && existing.kind === 'ok') return { result: 'held', info: existing.info }
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
