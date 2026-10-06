import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { nodeFs } from '../../../src/main/file/fsPort'
import {
  acquireLock,
  classifyLock,
  heartbeat,
  lockPathFor,
  releaseLock,
  STALE_AFTER_MS,
  takeOverLock,
  type LockInfo
} from '../../../src/main/file/lockFile'
import { tempDir } from './tmp'

let n = 0
const suffix = (): string => `l${++n}`

function person(
  sessionId: string,
  operator: string,
  computer: string,
  heartbeatAt = '2026-10-06T09:12:00.000Z'
): LockInfo {
  return {
    format: 1,
    sessionId,
    operator,
    computer,
    appVersion: '0.1.0',
    pid: 1,
    startedAt: heartbeatAt,
    heartbeatAt
  }
}

function deps(lockPath: string, me: LockInfo, now: Date) {
  return { fs: nodeFs, lockPath, me, now: () => now, randomSuffix: suffix }
}

const t0 = new Date('2026-10-06T09:12:00.000Z')

describe('classifyLock', () => {
  const hannah = person('h', 'Hannah', 'OFFICE-PC')
  it('free, mine, held and stale', () => {
    expect(classifyLock({ kind: 'none' }, 'me', t0)).toBe('free')
    expect(classifyLock({ kind: 'ok', info: hannah }, 'h', t0)).toBe('mine')
    expect(classifyLock({ kind: 'ok', info: hannah }, 'me', new Date(t0.getTime() + 60_000))).toBe(
      'held'
    )
    expect(
      classifyLock({ kind: 'ok', info: hannah }, 'me', new Date(t0.getTime() + STALE_AFTER_MS + 1))
    ).toBe('stale')
  })
  it('treats a corrupt lock as stale (offer takeover, never assume free)', () => {
    expect(classifyLock({ kind: 'corrupt' }, 'me', t0)).toBe('stale')
  })
  it('never calls a lock stale because the other computer clock is ahead', () => {
    const future = person('h', 'Hannah', 'OFFICE-PC', '2026-10-06T12:00:00.000Z')
    expect(classifyLock({ kind: 'ok', info: future }, 'me', t0)).toBe('held')
  })
})

describe('the edit lock on disk', () => {
  it('is taken when free and names the editor', async () => {
    const lockPath = lockPathFor(join(tempDir(), 'Locker data.lockers'))
    const me = person('me', 'Dave', 'DAVE-MAC')
    expect(await acquireLock(deps(lockPath, me, t0))).toEqual({ result: 'acquired' })
    const onDisk = JSON.parse(readFileSync(lockPath, 'utf8')) as LockInfo
    expect(onDisk).toMatchObject({ operator: 'Dave', computer: 'DAVE-MAC', sessionId: 'me' })
  })

  it('is respected while someone else holds it (two instances, one file)', async () => {
    const lockPath = lockPathFor(join(tempDir(), 'Locker data.lockers'))
    await acquireLock(deps(lockPath, person('h', 'Hannah', 'OFFICE-PC'), t0))
    const second = await acquireLock(
      deps(lockPath, person('me', 'Dave', 'DAVE-MAC'), new Date(t0.getTime() + 5000))
    )
    expect(second).toMatchObject({
      result: 'held',
      info: { operator: 'Hannah', computer: 'OFFICE-PC' }
    })
  })

  it('is offered for takeover once the heartbeat is stale, and only then', async () => {
    const lockPath = lockPathFor(join(tempDir(), 'Locker data.lockers'))
    await acquireLock(deps(lockPath, person('h', 'Hannah', 'OFFICE-PC'), t0))
    const later = new Date(t0.getTime() + STALE_AFTER_MS + 60_000)
    const me = person('me', 'Dave', 'DAVE-MAC')
    expect(await acquireLock(deps(lockPath, me, later))).toMatchObject({
      result: 'stale',
      info: { operator: 'Hannah' }
    })
    await takeOverLock(deps(lockPath, me, later))
    expect(JSON.parse(readFileSync(lockPath, 'utf8'))).toMatchObject({ sessionId: 'me' })
  })

  it('heartbeat reports a lost lock after someone took over', async () => {
    const lockPath = lockPathFor(join(tempDir(), 'Locker data.lockers'))
    const hannah = person('h', 'Hannah', 'OFFICE-PC')
    await acquireLock(deps(lockPath, hannah, t0))
    await takeOverLock(deps(lockPath, person('me', 'Dave', 'DAVE-MAC'), t0))
    expect(await heartbeat(deps(lockPath, hannah, t0))).toMatchObject({
      result: 'lost',
      info: { operator: 'Dave' }
    })
  })

  it('heartbeat rewrites a lock that a sync hiccup removed', async () => {
    const lockPath = lockPathFor(join(tempDir(), 'Locker data.lockers'))
    const me = person('me', 'Dave', 'DAVE-MAC')
    expect(await heartbeat(deps(lockPath, me, t0))).toEqual({ result: 'ok' })
    expect(existsSync(lockPath)).toBe(true)
  })

  it('is released only by its owner', async () => {
    const lockPath = lockPathFor(join(tempDir(), 'Locker data.lockers'))
    const hannah = person('h', 'Hannah', 'OFFICE-PC')
    await acquireLock(deps(lockPath, hannah, t0))
    await releaseLock({ fs: nodeFs, lockPath, me: person('me', 'Dave', 'DAVE-MAC') })
    expect(existsSync(lockPath)).toBe(true)
    await releaseLock({ fs: nodeFs, lockPath, me: hannah })
    expect(existsSync(lockPath)).toBe(false)
  })

  it('treats a half-synced lock file as stale rather than free', async () => {
    const lockPath = lockPathFor(join(tempDir(), 'Locker data.lockers'))
    writeFileSync(lockPath, '{"format":1,"sessionId":"h","oper')
    expect(await acquireLock(deps(lockPath, person('me', 'Dave', 'DAVE-MAC'), t0))).toEqual({
      result: 'stale',
      info: null
    })
  })
})
