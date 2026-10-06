import { LOCK_TYPE_INFO, type LockType } from '@shared/locks'
import type { KeyEventKind, KeyInfo } from '@shared/keys'
import type { LockerDb } from '../db/db'
import { newId, stamp, type OperatorContext } from '../db/context'

// The key register (SPEC.md 3.4): every key given out, returned, lost, replaced or
// charged, against the lock it opens. Lock codes are never involved here.

export function keyInfo(db: LockerDb, lockerId: string): KeyInfo | null {
  const lock = db.get<{ id: string; type: LockType; key_number: string | null }>(
    "SELECT id, type, key_number FROM lock WHERE locker_id = $l AND status IN ('in_use','spare','lost') LIMIT 1",
    { $l: lockerId }
  )
  if (!lock || !LOCK_TYPE_INFO[lock.type].keyed) return null
  const events = db
    .all<{
      id: string
      event: KeyEventKind
      event_date: string
      sname: string | null
      notes: string | null
      amount_cents: number | null
      updated_by: string
    }>(
      `SELECT e.id, e.event, e.event_date, e.notes, e.amount_cents, e.updated_by,
              s.last_name || ', ' || COALESCE(s.preferred_name, s.first_name) AS sname
         FROM key_event e LEFT JOIN student s ON s.id = e.student_id
        WHERE e.lock_id = $id ORDER BY e.event_date DESC, e.created_at DESC`,
      { $id: lock.id }
    )
    .map((e) => ({
      id: e.id,
      event: e.event,
      date: e.event_date,
      student: e.sname,
      notes: e.notes,
      amountCents: e.amount_cents,
      by: e.updated_by
    }))
  let out = 0
  for (const e of [...events].reverse())
    out = e.event === 'issued' ? out + 1 : e.event === 'returned' ? Math.max(0, out - 1) : out
  return { lockId: lock.id, keyNumber: lock.key_number, keysOut: out, events }
}

function keyedLock(db: LockerDb, lockId: string): void {
  const lock = db.get<{ type: LockType }>('SELECT type FROM lock WHERE id = $id', { $id: lockId })
  if (!lock) throw new Error('That lock is no longer in the file.')
  if (!LOCK_TYPE_INFO[lock.type].keyed) throw new Error('That lock does not use a key.')
}

export function setKeyNumber(
  db: LockerDb,
  ctx: OperatorContext,
  lockId: string,
  keyNumber: string | null
): void {
  keyedLock(db, lockId)
  db.run('UPDATE lock SET key_number = $k, updated_at = $at, updated_by = $by WHERE id = $id', {
    $id: lockId,
    $k: keyNumber?.trim() || null,
    $at: ctx.now().toISOString(),
    $by: ctx.operator
  })
}

export function addKeyEvent(
  db: LockerDb,
  ctx: OperatorContext,
  e: {
    lockId: string
    event: KeyEventKind
    studentId: string | null
    notes: string | null
    amountCents: number | null
  }
): void {
  keyedLock(db, e.lockId)
  if (e.event === 'charged' && (e.amountCents === null || e.amountCents <= 0))
    throw new Error('Enter the amount charged.')
  const s = stamp(ctx)
  db.run(
    `INSERT INTO key_event (id, lock_id, event, event_date, student_id, notes, amount_cents, created_at, updated_at, updated_by)
     VALUES ($id, $lock, $ev, $date, $st, $notes, $amt, $at, $at, $by)`,
    {
      $id: newId(),
      $lock: e.lockId,
      $ev: e.event,
      $date: s.created_at,
      $st: e.studentId,
      $notes: e.notes?.trim() || null,
      $amt: e.event === 'charged' ? e.amountCents : null,
      $at: s.created_at,
      $by: s.updated_by
    }
  )
}
