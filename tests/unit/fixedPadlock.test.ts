import { describe, expect, it } from 'vitest'
import { lockForLocker, revealCode } from '../../src/main/repos/codes'
import { lockerHandlers } from '../../src/main/rpc/lockerHandlers'
import { noteOpenFile, setPin, unlockCodes } from '../../src/main/privacy'
import { allocatedDemo } from './fixtures'

// SPEC.md 4.5: a fixed-code padlock's code comes with it, so "recode" means a new
// padlock and staff type in its code and serial. Every school here is SYNTHETIC.

const setFixed = lockerHandlers['codes.setFixed']
if (setFixed.kind !== 'write') throw new Error('codes.setFixed must be a write')

async function heldFixedPadlock() {
  const { db, ctx } = await allocatedDemo()
  const lock = db.get<{ id: string; locker_id: string }>(
    `SELECT k.id, k.locker_id FROM lock k
       JOIN assignment a ON a.locker_id = k.locker_id AND a.status = 'current'
      WHERE k.type = 'combination_builtin' LIMIT 1`
  )!
  db.run(
    "UPDATE lock SET type = 'combination_padlock_fixed', code_status = 'reset_no_code', code_cipher = NULL WHERE id = $id",
    { $id: lock.id }
  )
  // Each test starts with no PIN unlocked.
  noteOpenFile(null)
  noteOpenFile(`test-${lock.id}`)
  return { db, ctx, lock }
}

const reveals = (db: Awaited<ReturnType<typeof allocatedDemo>>['db'], lockerId: string) =>
  db.get<{ n: number }>('SELECT COUNT(*) AS n FROM code_reveal_log WHERE locker_id = $l', {
    $l: lockerId
  })!.n

describe('Record the new padlock (codes.setFixed)', () => {
  it('records the code and serial without counting as a reveal', async () => {
    const { db, ctx, lock } = await heldFixedPadlock()
    const before = reveals(db, lock.locker_id)
    setFixed.run(db, ctx, { lockerId: lock.locker_id, code: '1 2 3 4', serial: ' SN-0042 ' })
    expect(reveals(db, lock.locker_id)).toBe(before)
    expect(lockForLocker(db, lock.locker_id)?.code_status).toBe('set')
    expect(revealCode(db, ctx, lock.locker_id, 'screen')).toBe('1234')
    expect(
      db.get<{ s: string }>('SELECT serial_number AS s FROM lock WHERE id = $id', { $id: lock.id })
        ?.s
    ).toBe('SN-0042')
  })

  it('keeps the old padlock’s code in the code history', async () => {
    const { db, ctx, lock } = await heldFixedPadlock()
    const history = () =>
      db.all<{ to_date: string | null }>('SELECT to_date FROM code_history WHERE lock_id = $id', {
        $id: lock.id
      })
    const before = history().length
    setFixed.run(db, ctx, { lockerId: lock.locker_id, code: '1234', serial: null })
    setFixed.run(db, ctx, { lockerId: lock.locker_id, code: '5678', serial: null })
    const rows = history()
    expect(rows).toHaveLength(before + 2)
    expect(rows.filter((r) => r.to_date === null)).toHaveLength(1)
    expect(revealCode(db, ctx, lock.locker_id, 'screen')).toBe('5678')
  })

  it('refuses a code of the wrong length', async () => {
    const { db, ctx, lock } = await heldFixedPadlock()
    expect(() =>
      setFixed.run(db, ctx, { lockerId: lock.locker_id, code: '12', serial: null })
    ).toThrow(/numbers from 0/)
  })

  it('refuses a lock whose code the app sets', async () => {
    const { db, ctx } = await allocatedDemo()
    const settable = db.get<{ locker_id: string }>(
      "SELECT locker_id FROM lock WHERE type = 'combination_builtin' AND locker_id IS NOT NULL LIMIT 1"
    )!
    expect(() =>
      setFixed.run(db, ctx, { lockerId: settable.locker_id, code: '1234', serial: null })
    ).toThrow(/fixed-code padlock/)
  })

  it('needs the PIN when the school has one', async () => {
    const { db, ctx, lock } = await heldFixedPadlock()
    setPin(db, ctx, '4821', null)
    expect(() =>
      setFixed.run(db, ctx, { lockerId: lock.locker_id, code: '1234', serial: null })
    ).toThrow(/PIN/)
    unlockCodes(db, '4821')
    setFixed.run(db, ctx, { lockerId: lock.locker_id, code: '1234', serial: null })
    expect(lockForLocker(db, lock.locker_id)?.code_status).toBe('set')
  })
})
