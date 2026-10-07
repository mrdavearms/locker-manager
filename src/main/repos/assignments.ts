import {
  AllocationPlanSchema,
  DEFAULT_PLAN,
  planForRule,
  type AllocationDraft,
  type AllocationPlan,
  type DraftView
} from '@shared/allocation'
import type { LockerDb } from '../db/db'
import { newId, stamp, type OperatorContext } from '../db/context'
import { allocate, orderLockers, type EngineLocker, type EngineStudent } from '../allocate/engine'
import { displayGroup } from '../import/groups'
import { activeYearId, issueCode, lockForLocker, markNeedsNewCode } from './codes'
import { getSetting, setSetting } from './settings'
import { groupMap, sortLastGroups } from './students'

// Assignments (SPEC.md 3.6 and 4.4): every change moves whole student records,
// never names (section 15, item 2), and every holder change flags the codes.

function today(ctx: OperatorContext): string {
  return ctx.now().toISOString().slice(0, 10)
}

function requireYear(db: LockerDb): string {
  const y = activeYearId(db)
  if (!y) throw new Error('There is no active school year.')
  return y
}

export function currentAssignment(
  db: LockerDb,
  studentId: string
): { id: string; lockerId: string } | null {
  const r = db.get<{ id: string; locker_id: string }>(
    "SELECT id, locker_id FROM assignment WHERE student_id = $s AND status = 'current' LIMIT 1",
    { $s: studentId }
  )
  return r ? { id: r.id, lockerId: r.locker_id } : null
}

function insertAssignment(
  db: LockerDb,
  ctx: OperatorContext,
  studentId: string,
  lockerId: string
): string {
  const s = stamp(ctx)
  const id = newId()
  db.run(
    `INSERT INTO assignment (id, student_id, locker_id, school_year_id, start_date, status, created_at, updated_at, updated_by)
     VALUES ($id, $s, $l, $y, $d, 'current', $c, $c, $by)`,
    {
      $id: id,
      $s: studentId,
      $l: lockerId,
      $y: requireYear(db),
      $d: today(ctx),
      $c: s.created_at,
      $by: s.updated_by
    }
  )
  return id
}

function endAssignment(
  db: LockerDb,
  ctx: OperatorContext,
  assignmentId: string,
  reason: 'left_school' | 'moved_locker' | 'year_rollover' | 'swap' | 'released_by_operator'
): void {
  db.run(
    "UPDATE assignment SET status = 'ended', end_date = $d, end_reason = $r, updated_at = $at, updated_by = $by WHERE id = $id",
    {
      $id: assignmentId,
      $d: today(ctx),
      $r: reason,
      $at: ctx.now().toISOString(),
      $by: ctx.operator
    }
  )
}

function issueFor(db: LockerDb, ctx: OperatorContext, lockerId: string): string | null {
  const lock = lockForLocker(db, lockerId)
  return lock ? issueCode(db, ctx, lock.id, 'issued') : null
}

function flagOld(db: LockerDb, ctx: OperatorContext, lockerId: string): void {
  const lock = lockForLocker(db, lockerId)
  if (lock) markNeedsNewCode(db, ctx, lock.id)
}

function studentName(db: LockerDb, id: string): string {
  const r = db.get<{ n: string }>(
    "SELECT COALESCE(preferred_name, first_name) || ' ' || last_name AS n FROM student WHERE id = $id",
    { $id: id }
  )
  if (!r) throw new Error('That student is no longer in the file.')
  return r.n
}

/** New student: give a locker and a code (SPEC.md 4.4 "Assign"). */
export function assignStudent(
  db: LockerDb,
  ctx: OperatorContext,
  studentId: string,
  lockerId: string
): { code: string | null } {
  studentName(db, studentId)
  if (currentAssignment(db, studentId))
    throw new Error('This student already has a locker. Use Move instead.')
  insertAssignment(db, ctx, studentId, lockerId)
  return { code: issueFor(db, ctx, lockerId) }
}

/** Student has left, or the locker is taken back: the code must change (SPEC.md 4.4 "Release"). */
export function releaseStudent(
  db: LockerDb,
  ctx: OperatorContext,
  studentId: string,
  opts: { left: boolean }
): { lockerId: string } {
  const a = currentAssignment(db, studentId)
  if (!a) throw new Error('This student does not hold a locker.')
  endAssignment(db, ctx, a.id, opts.left ? 'left_school' : 'released_by_operator')
  flagOld(db, ctx, a.lockerId)
  if (opts.left) {
    const at = ctx.now().toISOString()
    db.run(
      'UPDATE student SET active = 0, left_at = $d, updated_at = $at, updated_by = $by WHERE id = $id',
      { $id: studentId, $d: at.slice(0, 10), $at: at, $by: ctx.operator }
    )
  }
  return { lockerId: a.lockerId }
}

/** Move to another locker: the old code is known to this student, so it changes too. */
export function moveStudent(
  db: LockerDb,
  ctx: OperatorContext,
  studentId: string,
  toLockerId: string
): { from: string; code: string | null } {
  const a = currentAssignment(db, studentId)
  if (!a) throw new Error('This student does not hold a locker. Use New student instead.')
  if (a.lockerId === toLockerId) throw new Error('That is the locker they already have.')
  endAssignment(db, ctx, a.id, 'moved_locker')
  flagOld(db, ctx, a.lockerId)
  insertAssignment(db, ctx, studentId, toLockerId)
  return { from: a.lockerId, code: issueFor(db, ctx, toLockerId) }
}

/** Two students exchange lockers. Whole records move; both codes change (each knows the other's). */
export function swapStudents(db: LockerDb, ctx: OperatorContext, aId: string, bId: string): void {
  const a = currentAssignment(db, aId)
  const b = currentAssignment(db, bId)
  if (!a || !b) throw new Error('Both students need a locker to swap.')
  if (aId === bId) throw new Error('Choose two different students.')
  endAssignment(db, ctx, a.id, 'swap')
  endAssignment(db, ctx, b.id, 'swap')
  flagOld(db, ctx, a.lockerId)
  flagOld(db, ctx, b.lockerId)
  insertAssignment(db, ctx, aId, b.lockerId)
  insertAssignment(db, ctx, bId, a.lockerId)
  issueFor(db, ctx, b.lockerId)
  issueFor(db, ctx, a.lockerId)
}

// ------------------------------------------------------------- allocation

export function savedPlan(db: LockerDb): AllocationPlan {
  const plan = getSetting(db, 'allocation.plan', AllocationPlanSchema, DEFAULT_PLAN)
  if (plan.rules.length > 0) return plan
  // No plan yet: one rule per area that names its year levels (Year 7 side gets Year 7).
  const areas = db.all<{ id: string; name: string; default_year_levels: string }>(
    'SELECT id, name, default_year_levels FROM area WHERE archived_at IS NULL ORDER BY sort_order'
  )
  const rules = areas.map((a) => {
    let years: string[] = []
    try {
      const v: unknown = JSON.parse(a.default_year_levels)
      if (Array.isArray(v)) years = v.filter((x): x is string => typeof x === 'string')
    } catch {
      years = []
    }
    return { id: a.id, label: a.name, yearLevels: years, groups: [], areaIds: [a.id], bankIds: [] }
  })
  return { ...plan, rules, groupsLast: sortLastGroups(db) }
}

export function savePlan(db: LockerDb, ctx: OperatorContext, plan: AllocationPlan): void {
  setSetting(db, ctx, 'allocation.plan', plan)
}

export function engineInputs(db: LockerDb): { students: EngineStudent[]; lockers: EngineLocker[] } {
  const students = db
    .all<{
      id: string
      year_level: string | null
      group_code: string | null
      house: string | null
      last_name: string
      first_name: string
      preferred_name: string | null
      needs_accessible: number
      external_id: string
      has_locker: number
      last_locker: string | null
      excluded: number
    }>(
      `SELECT s.id, s.year_level, s.group_code, s.house, s.last_name, s.first_name, s.preferred_name, s.needs_accessible, s.external_id,
              EXISTS (SELECT 1 FROM assignment a WHERE a.student_id = s.id AND a.status = 'current') AS has_locker,
              (SELECT a.locker_id FROM assignment a WHERE a.student_id = s.id AND a.end_reason = 'year_rollover' ORDER BY a.end_date DESC LIMIT 1) AS last_locker,
              EXISTS (SELECT 1 FROM exclusion e WHERE (e.kind = 'student' AND e.value = s.external_id) OR (e.kind = 'group' AND e.value = s.group_code)
                        OR (e.kind = 'year_level' AND e.value = s.year_level)) AS excluded
         FROM student s WHERE s.archived_at IS NULL AND s.active = 1`
    )
    .map((s) => ({
      id: s.id,
      yearLevel: s.year_level,
      group: s.group_code,
      house: s.house,
      lastName: s.last_name,
      firstName: s.preferred_name || s.first_name,
      needsAccessible: s.needs_accessible === 1,
      excluded: s.excluded === 1,
      hasLocker: s.has_locker === 1,
      lastYearLockerId: s.last_locker
    }))
  const lockers = db
    .all<{
      id: string
      sort_key: string
      area_id: string
      bank_id: string
      area_order: number
      bank_order: number
      position_row: number | null
      position_column: number | null
      tier: EngineLocker['tier']
      accessible: number
      status: string
      capacity: number
      holders: number
    }>(
      `SELECT l.id, l.sort_key, b.area_id, l.bank_id, a.sort_order AS area_order, b.sort_order AS bank_order, l.position_row, l.position_column, l.tier,
              l.accessible, l.status, l.capacity,
              (SELECT COUNT(*) FROM assignment x WHERE x.locker_id = l.id AND x.status = 'current') AS holders
         FROM locker l JOIN bank b ON b.id = l.bank_id JOIN area a ON a.id = b.area_id
        WHERE l.archived_at IS NULL AND b.archived_at IS NULL AND a.archived_at IS NULL`
    )
    .map((l) => ({
      id: l.id,
      sortKey: l.sort_key,
      areaId: l.area_id,
      bankId: l.bank_id,
      areaOrder: Number(l.area_order),
      bankOrder: Number(l.bank_order),
      row: l.position_row,
      column: l.position_column,
      tier: l.tier,
      accessible: l.accessible === 1,
      free: l.status === 'in_service' ? Math.max(0, Number(l.capacity) - Number(l.holders)) : 0
    }))
  return { students, lockers }
}

export function draftAllocation(db: LockerDb, plan: AllocationPlan): DraftView {
  const { students, lockers } = engineInputs(db)
  const draft = allocate(students, lockers, plan)
  const map = groupMap(db)
  const info: DraftView['students'] = {}
  const rows = db.all<{
    id: string
    name: string
    group_code: string | null
    year_level: string | null
    needs_accessible: number
  }>(
    "SELECT id, COALESCE(preferred_name, first_name) || ' ' || last_name AS name, group_code, year_level, needs_accessible FROM student WHERE archived_at IS NULL AND active = 1"
  )
  for (const r of rows)
    info[r.id] = {
      name: r.name,
      group: r.group_code,
      groupDisplay: displayGroup(r.group_code, map),
      yearLevel: r.year_level,
      needsAccessible: r.needs_accessible === 1
    }
  return { draft, students: info }
}

/**
 * Commits a draft the operator has checked (and perhaps rearranged). Each line
 * is checked again against the file as it is now; codes are issued if asked.
 */
export function commitDraft(
  db: LockerDb,
  ctx: OperatorContext,
  assignments: AllocationDraft['assignments'],
  opts: { issueCodes: boolean }
): { assigned: number; codes: number } {
  const seen = new Set<string>()
  let codes = 0
  for (const a of assignments) {
    if (seen.has(a.studentId)) throw new Error('A student appears twice in the allocation.')
    seen.add(a.studentId)
    if (currentAssignment(db, a.studentId))
      throw new Error(
        `${studentName(db, a.studentId)} already has a locker. Make the allocation again.`
      )
    insertAssignment(db, ctx, a.studentId, a.lockerId)
    if (opts.issueCodes && issueFor(db, ctx, a.lockerId) !== null) codes++
  }
  return { assigned: assignments.length, codes }
}

/** The first spare locker in the student's area, by the plan's rules (SPEC.md 4.4). */
export function suggestLocker(
  db: LockerDb,
  studentId: string
): { lockerId: string; number: string } | null {
  const plan = savedPlan(db)
  const { students, lockers } = engineInputs(db)
  const s = students.find((x) => x.id === studentId)
  if (!s) return null
  const rule = plan.rules.find(
    (r) =>
      (r.yearLevels.length === 0 || (s.yearLevel !== null && r.yearLevels.includes(s.yearLevel))) &&
      (r.groups.length === 0 || (s.group !== null && r.groups.includes(s.group)))
  )
  const candidates = lockers.filter(
    (l) =>
      l.free > 0 &&
      (!rule ||
        ((rule.areaIds.length === 0 || rule.areaIds.includes(l.areaId)) &&
          (rule.bankIds.length === 0 || rule.bankIds.includes(l.bankId))))
  )
  const ordered = orderLockers(candidates, rule ? planForRule(plan, rule) : plan)
  const pick = (s.needsAccessible ? ordered.find((l) => l.accessible) : undefined) ?? ordered[0]
  if (!pick) return null
  const n = db.get<{ number: string }>('SELECT number FROM locker WHERE id = $id', { $id: pick.id })
  return { lockerId: pick.id, number: n?.number ?? '' }
}
