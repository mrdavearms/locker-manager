import { describe, expect, it } from 'vitest'
import { restoreProblem } from '../../src/main/restoreRecord'
import { allocatedDemo } from './fixtures'

// History "Put back to before this…" must not break the rules the normal screens keep
// (spec audit 9 Oct 2026, gap 4). Every school here is SYNTHETIC.

async function heldLocker() {
  const { db } = await allocatedDemo()
  const held = db.get<{ locker_id: string; student_id: string }>(
    "SELECT locker_id, student_id FROM assignment WHERE status = 'current' LIMIT 1"
  )!
  return { db, ...held }
}

describe('putting a record back from the history', () => {
  it('refuses to put a held locker back out of service', async () => {
    const { db, locker_id } = await heldLocker()
    expect(
      restoreProblem(db, 'locker', locker_id, { status: 'out_of_service', capacity: 1 })
    ).toMatch(/holds this locker now/)
  })

  it('refuses to make a locker take fewer students than hold it now', async () => {
    const { db, locker_id } = await heldLocker()
    db.run('UPDATE locker SET capacity = 2 WHERE id = $id', { $id: locker_id })
    const spare = db.get<{ id: string }>(
      `SELECT s.id FROM student s WHERE s.active = 1
         AND NOT EXISTS (SELECT 1 FROM assignment a WHERE a.student_id = s.id AND a.status = 'current') LIMIT 1`
    )!
    // A second holder, so the locker is shared by two students now.
    db.run(
      `INSERT INTO assignment (id, student_id, locker_id, school_year_id, start_date, status, created_at, updated_at, updated_by)
       SELECT 'syn-second', $s, $l, school_year_id, start_date, 'current', created_at, updated_at, updated_by
         FROM assignment WHERE locker_id = $l AND status = 'current' LIMIT 1`,
      { $s: spare.id, $l: locker_id }
    )
    expect(restoreProblem(db, 'locker', locker_id, { status: 'in_service', capacity: 1 })).toMatch(
      /must take at least 2/
    )
    expect(
      restoreProblem(db, 'locker', locker_id, { status: 'in_service', capacity: 2 })
    ).toBeNull()
  })

  it('refuses to mark a student as left while they still hold a locker', async () => {
    const { db, student_id } = await heldLocker()
    expect(restoreProblem(db, 'student', student_id, { active: 0 })).toMatch(/still holds a locker/)
    expect(restoreProblem(db, 'student', student_id, { active: 1 })).toBeNull()
  })

  it('lets a locker nobody holds go back out of service', async () => {
    const { db } = await allocatedDemo()
    const free = db.get<{ id: string }>(
      `SELECT l.id FROM locker l WHERE NOT EXISTS
         (SELECT 1 FROM assignment a WHERE a.locker_id = l.id AND a.status = 'current') LIMIT 1`
    )!
    expect(
      restoreProblem(db, 'locker', free.id, { status: 'out_of_service', capacity: 1 })
    ).toBeNull()
  })
})
