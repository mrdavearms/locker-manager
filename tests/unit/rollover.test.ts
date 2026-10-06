import { describe, expect, it } from 'vitest'
import { commitDraft, draftAllocation, savedPlan } from '../../src/main/repos/assignments'
import {
  generateYearSet,
  listCodeSets,
  lockForLocker,
  markResetDone,
  reserveSetForNextYear
} from '../../src/main/repos/codes'
import { assignStudent, releaseStudent } from '../../src/main/repos/assignments'
import { addKeyEvent, keyInfo, setKeyNumber } from '../../src/main/repos/keys'
import { letterSet } from '../../src/main/repos/letters'
import { setBankLocks } from '../../src/main/repos/locations'
import {
  archiveYear,
  finishRollover,
  nextYearLabel,
  promoteStudents,
  recordOnZero,
  rolloverStatus,
  selfResetGroups,
  startRollover
} from '../../src/main/repos/rollover'
import { codeKey, decryptCode } from '../../src/main/codes/cipher'
import { allocatedDemo } from './fixtures'

describe('year rollover (SPEC.md 4.10)', () => {
  it('names the next year', () => {
    expect(nextYearLabel('2026')).toBe('2027')
    expect(nextYearLabel('Semester 2')).toBe('Semester 2 (next)')
  })

  it('records students resetting their own locks, then archives the year with a typed confirmation', async () => {
    const { db, ctx, assigned } = await allocatedDemo()
    const year = db.get<{ label: string }>(
      "SELECT label FROM school_year WHERE status = 'active'"
    )!.label
    const s = startRollover(db, ctx)
    const spareOnZero = s.locksOnZero
    expect(s.started).toBe(true)
    expect(s.assignments).toBe(assigned)

    // Homeroom 7A reset their own locks in class.
    const groups = selfResetGroups(db)
    const a = groups.find((g) => g.group === '07A')!
    expect(a.locks.length).toBeGreaterThan(10)
    expect(
      recordOnZero(
        db,
        ctx,
        a.locks.map((l) => l.lockId)
      )
    ).toBe(a.locks.length)
    expect(selfResetGroups(db).find((g) => g.group === '07A')).toBeUndefined()

    expect(() => archiveYear(db, ctx, 'yes')).toThrow(/Type START/)
    const r = archiveYear(db, ctx, `start ${nextYearLabel(year)}`)
    expect(r.ended).toBe(assigned)
    expect(r.needReset).toBe(assigned - a.locks.length)
    const after = rolloverStatus(db)
    expect(after.currentYear).toBe(nextYearLabel(year))
    expect(after.archived).toBe(true)
    expect(after.assignments).toBe(0)
    expect(after.locksOnZero).toBe(spareOnZero + a.locks.length)
    expect(after.resetsWaiting).toBe(assigned - a.locks.length)
    expect(
      db.get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM assignment WHERE end_reason = 'year_rollover'"
      )!.n
    ).toBe(assigned)
    expect(db.all("SELECT * FROM school_year WHERE status = 'archived'")).toHaveLength(1)
    expect(() => archiveYear(db, ctx, `START ${nextYearLabel(year)}`)).toThrow(/already/)
  })

  it('gives next year codes that differ from last year’s, from a set made before the rollover', async () => {
    const { db, ctx } = await allocatedDemo()
    const key = codeKey(db)
    const before = new Map(
      db
        .all<{ id: string; code_cipher: Uint8Array }>(
          'SELECT id, code_cipher FROM lock WHERE code_cipher IS NOT NULL'
        )
        .map((r) => [r.id, decryptCode(key, r.code_cipher)])
    )
    generateYearSet(db, ctx, {
      name: 'SYNTHETIC next year',
      schoolYearId: db.get<{ id: string }>("SELECT id FROM school_year WHERE status='active'")!.id,
      seed: 'next'
    })
    startRollover(db, ctx)
    recordOnZero(db, ctx, [...before.keys()])
    archiveYear(db, ctx, `START ${rolloverStatus(db).nextYear}`)
    expect(rolloverStatus(db).nextYearCodeSets).toBe(1)
    const { draft } = draftAllocation(db, savedPlan(db))
    commitDraft(db, ctx, draft.assignments, { issueCodes: true })
    const after = db.all<{ id: string; code_cipher: Uint8Array; code_status: string }>(
      'SELECT id, code_cipher, code_status FROM lock WHERE code_cipher IS NOT NULL'
    )
    expect(after.length).toBeGreaterThan(200)
    for (const r of after) {
      expect(r.code_status).toBe('set')
      expect(decryptCode(key, r.code_cipher)).not.toBe(before.get(r.id))
    }
    expect(letterSet(db, { mode: 'all' }, true).heldBack).toEqual([])
  })

  it('moves students up a year level, and the last year level leaves', async () => {
    const { db, ctx } = await allocatedDemo()
    startRollover(db, ctx)
    expect(() => promoteStudents(db, ctx, '8')).toThrow(/Archive/)
    archiveYear(db, ctx, `START ${rolloverStatus(db).nextYear}`)
    const sevens = db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM student WHERE year_level = '7' AND active = 1"
    )!.n
    const r = promoteStudents(db, ctx, '8')
    expect(r.promoted).toBe(sevens)
    expect(
      db.get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM student WHERE year_level = '7' AND active = 1"
      )!.n
    ).toBe(0)
    expect(
      db.get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM student WHERE year_level = '8' AND active = 1"
      )!.n
    ).toBe(sevens)
    expect(() => promoteStudents(db, ctx, '8')).toThrow(/already/)
    finishRollover(db)
    expect(rolloverStatus(db).started).toBe(false)
  })
})

describe('a code set made during the year is kept for next year', () => {
  it('is not used by new students mid-year, and moves to the new year at the rollover', async () => {
    const { db, ctx } = await allocatedDemo()
    const yearId = db.get<{ id: string }>("SELECT id FROM school_year WHERE status='active'")!.id
    const r = generateYearSet(db, ctx, { name: 'SYNTHETIC next', schoolYearId: yearId, seed: 'n' })
    reserveSetForNextYear(db, ctx, r.set)
    expect(listCodeSets(db).find((x) => x.id === r.set)?.forNextYear).toBe(true)
    // A student leaves and another takes the locker: no entry of the reserved set is used.
    const a = db.get<{ student_id: string; locker_id: string }>(
      "SELECT student_id, locker_id FROM assignment WHERE status='current' LIMIT 1"
    )!
    releaseStudent(db, ctx, a.student_id, { left: true })
    const lock = lockForLocker(db, a.locker_id)!
    markResetDone(db, ctx, lock.id)
    const spare = db.get<{ id: string }>(
      "SELECT s.id FROM student s WHERE s.active = 1 AND NOT EXISTS (SELECT 1 FROM assignment x WHERE x.student_id = s.id AND x.status='current') AND s.group_code <> 'ZZZ' LIMIT 1"
    )
    if (spare) assignStudent(db, ctx, spare.id, a.locker_id)
    const used = db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM code_set_entry WHERE code_set_id = $s AND status <> 'available'",
      { $s: r.set }
    )!.n
    expect(used).toBe(0)
    startRollover(db, ctx)
    archiveYear(db, ctx, `START ${rolloverStatus(db).nextYear}`)
    const moved = db.get<{ status: string }>(
      'SELECT y.status FROM code_set s JOIN school_year y ON y.id = s.school_year_id WHERE s.id = $s',
      { $s: r.set }
    )!.status
    expect(moved).toBe('active')
    expect(listCodeSets(db).find((x) => x.id === r.set)?.forNextYear).toBe(false)
  })
})

describe('key register (SPEC.md 3.4)', () => {
  it('records key numbers and keys given out and returned', async () => {
    const { db, ctx } = await allocatedDemo()
    const bank = db.get<{ id: string }>('SELECT id FROM bank LIMIT 1')!.id
    setBankLocks(db, ctx, bank, { type: 'keyed_padlock', dials: 4, positionsPerDial: 10 })
    const locker = db.get<{ id: string }>('SELECT id FROM locker WHERE bank_id = $b LIMIT 1', {
      $b: bank
    })!.id
    const info = keyInfo(db, locker)!
    expect(info.keysOut).toBe(0)
    setKeyNumber(db, ctx, info.lockId, 'K-101')
    addKeyEvent(db, ctx, {
      lockId: info.lockId,
      event: 'issued',
      studentId: null,
      notes: null,
      amountCents: null
    })
    ctx.advance(1000)
    addKeyEvent(db, ctx, {
      lockId: info.lockId,
      event: 'issued',
      studentId: null,
      notes: 'spare',
      amountCents: null
    })
    ctx.advance(1000)
    addKeyEvent(db, ctx, {
      lockId: info.lockId,
      event: 'returned',
      studentId: null,
      notes: null,
      amountCents: null
    })
    const after = keyInfo(db, locker)!
    expect(after.keyNumber).toBe('K-101')
    expect(after.keysOut).toBe(1)
    expect(after.events[0]!.event).toBe('returned')
    expect(() =>
      addKeyEvent(db, ctx, {
        lockId: info.lockId,
        event: 'charged',
        studentId: null,
        notes: null,
        amountCents: null
      })
    ).toThrow(/amount/)
    const combo = lockForLocker(
      db,
      db.get<{ id: string }>('SELECT id FROM locker WHERE bank_id <> $b LIMIT 1', { $b: bank })!.id
    )!
    expect(() => setKeyNumber(db, ctx, combo.id, 'X')).toThrow(/key/)
  })
})
