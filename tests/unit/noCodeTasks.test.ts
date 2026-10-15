import { describe, expect, it } from 'vitest'
import { issueCode, lockForLocker, resetTasks } from '../../src/main/repos/codes'
import { lockerHandlers } from '../../src/main/rpc/lockerHandlers'
import { listProblems } from '../../src/main/repos/problems'
import { allocatedDemo } from './fixtures'

// SPEC.md section 15 item 3: a lock on 0 0 0 0 with no code is a real state and
// needs a to-do item (spec audit gap 7). Every school here is SYNTHETIC.

async function heldOnZero() {
  const { db, ctx } = await allocatedDemo()
  const lock = db.get<{ id: string; locker_id: string }>(
    `SELECT k.id, k.locker_id FROM lock k
       JOIN assignment a ON a.locker_id = k.locker_id AND a.status = 'current'
      WHERE k.type = 'combination_builtin' LIMIT 1`
  )!
  db.run("UPDATE lock SET code_status = 'reset_no_code', code_cipher = NULL WHERE id = $id", {
    $id: lock.id
  })
  return { db, ctx, lock }
}

describe('a held lock left on 0 0 0 0', () => {
  it('is on the to-do list, waiting for a code', async () => {
    const { db, lock } = await heldOnZero()
    const task = resetTasks(db).find((t) => t.lockId === lock.id)
    expect(task).toMatchObject({ status: 'reset_no_code', lockerId: lock.locker_id })
    expect(task!.holder).not.toBeNull()
  })

  it('shows as a problem on Home', async () => {
    const { db } = await heldOnZero()
    expect(listProblems(db).find((p) => p.id === 'no-code')?.title).toBe(
      '1 held lock has no code yet'
    )
  })

  it('leaves the list once a code is issued', async () => {
    const { db, ctx, lock } = await heldOnZero()
    expect(issueCode(db, ctx, lock.id, 'issued')).toMatch(/^\d+$/)
    expect(resetTasks(db).find((t) => t.lockId === lock.id)).toBeUndefined()
    expect(listProblems(db).find((p) => p.id === 'no-code')).toBeUndefined()
  })

  it('does not list a spare lock on 0 0 0 0: that is how a spare should be', async () => {
    const { db } = await allocatedDemo()
    const spare = db.get<{ id: string }>(
      `SELECT k.id FROM lock k WHERE k.locker_id IS NOT NULL AND NOT EXISTS
         (SELECT 1 FROM assignment a WHERE a.locker_id = k.locker_id AND a.status = 'current') LIMIT 1`
    )!
    db.run("UPDATE lock SET code_status = 'reset_no_code', code_cipher = NULL WHERE id = $id", {
      $id: spare.id
    })
    expect(resetTasks(db).find((t) => t.lockId === spare.id)).toBeUndefined()
  })
})

describe('Issue a code, from the to-do list', () => {
  const issue = lockerHandlers['codes.issue']
  if (issue.kind !== 'write') throw new Error('codes.issue must be a write')

  it('gives the lock a code the student sets, and records that it was shown', async () => {
    const { db, ctx, lock } = await heldOnZero()
    const shown = () =>
      db.get<{ n: number }>('SELECT COUNT(*) AS n FROM code_reveal_log WHERE locker_id = $l', {
        $l: lock.locker_id
      })!.n
    const before = shown()
    const r = issue.run(db, ctx, { lockerId: lock.locker_id })
    expect(r.code).toMatch(/^\d+$/)
    expect(shown()).toBe(before + 1)
    expect(lockForLocker(db, lock.locker_id)?.code_status).toBe('set')
  })

  it('refuses a lock that already has a code', async () => {
    const { db, ctx } = await allocatedDemo()
    const held = db.get<{ locker_id: string }>(
      "SELECT k.locker_id FROM lock k WHERE k.code_status = 'set' AND k.locker_id IS NOT NULL LIMIT 1"
    )!
    expect(() => issue.run(db, ctx, { lockerId: held.locker_id })).toThrow(/already has a code/)
  })
})
