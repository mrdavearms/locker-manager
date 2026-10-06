import { z } from 'zod'
import { LOCK_TYPE_INFO, type LockType } from '@shared/locks'
import type { RolloverStatus, SelfResetGroup } from '@shared/rollover'
import type { CodeStatus } from '@shared/codes'
import type { LockerDb } from '../db/db'
import { newId, stamp, type OperatorContext } from '../db/context'
import { displayGroup } from '../import/groups'
import { compareLockerNumbers } from '../locations/lockerNumbers'
import { releaseReservedSets } from './codes'
import { letterSet } from './letters'
import { getSetting, setSetting } from './settings'
import { groupMap } from './students'

// Year rollover (SPEC.md 4.10): the riskiest moment of the year, so it is guided,
// kept in the file (a second person can carry on where the first stopped), and the
// archive step needs a typed confirmation and keeps a named backup first.

const PROGRESS_KEY = 'rollover.progress'
const ProgressSchema = z.object({
  fromYear: z.string(),
  toYear: z.string(),
  startedAt: z.string(),
  archivedAt: z.string().nullable(),
  promoted: z.boolean()
})
type Progress = z.infer<typeof ProgressSchema>

interface YearRow {
  id: string
  label: string
  start_date: string
  end_date: string
}

function activeYear(db: LockerDb): YearRow | null {
  return (
    db.get<YearRow>(
      "SELECT id, label, start_date, end_date FROM school_year WHERE status = 'active' LIMIT 1"
    ) ?? null
  )
}

/** "2026" -> "2027"; anything else gets " (next)". */
export function nextYearLabel(label: string): string {
  return /^\d{4}$/.test(label.trim()) ? String(Number(label.trim()) + 1) : `${label} (next)`
}

function progress(db: LockerDb): Progress | null {
  return getSetting(db, PROGRESS_KEY, ProgressSchema.nullable(), null)
}

export function rolloverStatus(db: LockerDb): RolloverStatus {
  const year = activeYear(db)
  const p = progress(db)
  const count = (sql: string): number => Number(db.get<{ n: number }>(sql)?.n ?? 0)
  const lettersWaiting = p?.archivedAt ? 0 : letterSet(db, { mode: 'changed' }, true).records.length
  const lastLetters = db.get<{ at: string | null }>(
    "SELECT MAX(printed_at) AS at FROM print_job WHERE kind = 'letters'"
  )?.at
  return {
    currentYear: year?.label ?? null,
    nextYear: p?.toYear ?? nextYearLabel(year?.label ?? String(new Date().getFullYear())),
    started: p !== null,
    archived: p?.archivedAt != null,
    promoted: p?.promoted ?? false,
    assignments: count("SELECT COUNT(*) AS n FROM assignment WHERE status = 'current'"),
    locksWithKnownCodes: count(
      "SELECT COUNT(*) AS n FROM lock WHERE code_status IN ('set','awaiting_physical_reset') AND status IN ('in_use','spare')"
    ),
    locksOnZero: count(
      "SELECT COUNT(*) AS n FROM lock WHERE code_status = 'reset_no_code' AND status IN ('in_use','spare')"
    ),
    resetsWaiting: count(
      "SELECT COUNT(*) AS n FROM lock WHERE code_status IN ('needs_new_code','awaiting_physical_reset') AND status IN ('in_use','spare')"
    ),
    lettersNotPrinted: lastLetters ? lettersWaiting : null,
    nextYearCodeSets: count(
      `SELECT COUNT(*) AS n FROM code_set s JOIN school_year y ON y.id = s.school_year_id
        WHERE s.purpose = 'year' AND y.status = 'active' AND EXISTS (SELECT 1 FROM code_set_entry e WHERE e.code_set_id = s.id AND e.status = 'available')`
    ),
    studentsWithoutLocker: count(
      `SELECT COUNT(*) AS n FROM student s WHERE s.archived_at IS NULL AND s.active = 1
        AND NOT EXISTS (SELECT 1 FROM assignment a WHERE a.student_id = s.id AND a.status = 'current')`
    )
  }
}

export function startRollover(db: LockerDb, ctx: OperatorContext): RolloverStatus {
  const year = activeYear(db)
  if (!year) throw new Error('The file has no current school year.')
  if (!progress(db))
    setSetting(db, ctx, PROGRESS_KEY, {
      fromYear: year.label,
      toYear: nextYearLabel(year.label),
      startedAt: ctx.now().toISOString(),
      archivedAt: null,
      promoted: false
    } satisfies Progress)
  return rolloverStatus(db)
}

/** Locks that still hold a student's code, by that student's group, for the self-reset record. */
export function selfResetGroups(db: LockerDb): SelfResetGroup[] {
  const map = groupMap(db)
  const rows = db.all<{
    lock_id: string
    type: LockType
    number: string
    group_code: string | null
    name: string
  }>(
    `SELECT k.id AS lock_id, k.type, l.number, s.group_code,
            s.last_name || ', ' || COALESCE(s.preferred_name, s.first_name) AS name
       FROM assignment a JOIN student s ON s.id = a.student_id JOIN locker l ON l.id = a.locker_id
       JOIN lock k ON k.locker_id = l.id AND k.status IN ('in_use','spare')
      WHERE a.status = 'current' AND k.code_status IN ('set','awaiting_physical_reset')`
  )
  const groups = new Map<string, SelfResetGroup>()
  for (const r of rows) {
    if (!LOCK_TYPE_INFO[r.type].codeSettable) continue
    const code = r.group_code ?? '—'
    const g = groups.get(code) ?? {
      group: code,
      display: displayGroup(r.group_code, map) ?? code,
      locks: []
    }
    g.locks.push({ lockId: r.lock_id, locker: r.number, student: r.name })
    groups.set(code, g)
  }
  return [...groups.values()]
    .map((g) => ({ ...g, locks: g.locks.sort((a, b) => compareLockerNumbers(a.locker, b.locker)) }))
    .sort((a, b) => a.group.localeCompare(b.group, 'en-AU', { numeric: true }))
}

/**
 * Students reset these locks to 0 0 0 0 themselves (SPEC.md 4.10 guidance). Each lock
 * now has no code; the next holder gets a new one to set.
 */
export function recordOnZero(
  db: LockerDb,
  ctx: OperatorContext,
  lockIds: readonly string[]
): number {
  const now = ctx.now().toISOString()
  let n = 0
  for (const id of lockIds) {
    const lock = db.get<{ type: LockType; code_status: CodeStatus }>(
      'SELECT type, code_status FROM lock WHERE id = $id',
      { $id: id }
    )
    if (!lock || !LOCK_TYPE_INFO[lock.type].codeSettable) continue
    if (lock.code_status === 'reset_no_code') continue
    db.run('UPDATE code_history SET to_date = $now WHERE lock_id = $id AND to_date IS NULL', {
      $id: id,
      $now: now
    })
    db.run(
      "UPDATE lock SET code_status = 'reset_no_code', code_cipher = NULL, updated_at = $now, updated_by = $by WHERE id = $id",
      { $id: id, $now: now, $by: ctx.operator }
    )
    n++
  }
  return n
}

export function archiveConfirmation(toYear: string): string {
  return `START ${toYear}`
}

/**
 * Ends this year: every current assignment ends ("year rollover"), the year becomes
 * read-only history, next year becomes current, and every lock whose code a student
 * still knows goes on the reset list. A code set already made for next year moves
 * with it.
 */
export function archiveYear(
  db: LockerDb,
  ctx: OperatorContext,
  typed: string
): { ended: number; needReset: number; toYear: string } {
  const p = progress(db)
  const year = activeYear(db)
  if (!p || !year) throw new Error('Start the rollover first.')
  if (p.archivedAt) throw new Error(`${p.fromYear} has already been archived.`)
  if (typed.trim().toUpperCase() !== archiveConfirmation(p.toYear).toUpperCase())
    throw new Error(`Type ${archiveConfirmation(p.toYear)} to confirm.`)
  const s = stamp(ctx)
  const today = s.created_at.slice(0, 10)
  const ended = Number(
    db.get<{ n: number }>("SELECT COUNT(*) AS n FROM assignment WHERE status = 'current'")?.n ?? 0
  )
  db.run(
    `UPDATE assignment SET status = 'ended', end_date = $d, end_reason = 'year_rollover',
            updated_at = $at, updated_by = $by WHERE status = 'current'`,
    { $d: today, $at: s.created_at, $by: s.updated_by }
  )
  // Codes the leaving students know: those locks need a reset before anyone else uses them.
  const settable = (Object.keys(LOCK_TYPE_INFO) as LockType[]).filter(
    (t) => LOCK_TYPE_INFO[t].codeSettable
  )
  const needReset = Number(
    db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM lock WHERE code_status IN ('set','awaiting_physical_reset')
        AND status IN ('in_use','spare') AND type IN (${settable.map((t) => `'${t}'`).join(',')})`
    )?.n ?? 0
  )
  db.run(
    `UPDATE lock SET code_status = 'needs_new_code', updated_at = $at, updated_by = $by
      WHERE code_status IN ('set','awaiting_physical_reset') AND status IN ('in_use','spare')
        AND type IN (${settable.map((t) => `'${t}'`).join(',')})`,
    { $at: s.created_at, $by: s.updated_by }
  )
  db.run(
    "UPDATE school_year SET status = 'archived', updated_at = $at, updated_by = $by WHERE id = $id",
    {
      $id: year.id,
      $at: s.created_at,
      $by: s.updated_by
    }
  )
  const nextId = newId()
  const numeric = /^\d{4}$/.test(p.toYear)
  db.run(
    `INSERT INTO school_year (id, label, start_date, end_date, status, created_at, updated_at, updated_by)
     VALUES ($id, $label, $start, $end, 'active', $at, $at, $by)`,
    {
      $id: nextId,
      $label: p.toYear,
      $start: numeric ? `${p.toYear}-01-01` : today,
      $end: numeric ? `${p.toYear}-12-31` : today,
      $at: s.created_at,
      $by: s.updated_by
    }
  )
  // Code sets made for next year while lockers were out move into it.
  releaseReservedSets(db, ctx, nextId)
  // A year code set made before the rollover, and never used, was made for next year.
  db.run(
    `UPDATE code_set SET school_year_id = $next, updated_at = $at, updated_by = $by
      WHERE purpose = 'year' AND school_year_id = $old
        AND NOT EXISTS (SELECT 1 FROM code_set_entry e WHERE e.code_set_id = code_set.id AND e.status <> 'available')`,
    { $next: nextId, $old: year.id, $at: s.created_at, $by: s.updated_by }
  )
  setSetting(db, ctx, PROGRESS_KEY, { ...p, archivedAt: s.created_at } satisfies Progress)
  return { ended, needReset, toYear: p.toYear }
}

/**
 * Moves every current student up one year level, for schools that keep students
 * across years. Students already in the last year level are marked as left.
 */
export function promoteStudents(
  db: LockerDb,
  ctx: OperatorContext,
  lastYearLevel: string
): { promoted: number; left: number } {
  const p = progress(db)
  if (!p?.archivedAt) throw new Error('Archive the year before moving students up.')
  if (p.promoted) throw new Error('Students have already been moved up this rollover.')
  const last = Number(lastYearLevel)
  if (!Number.isInteger(last)) throw new Error('Choose the last year level as a number.')
  const now = ctx.now().toISOString()
  const rows = db.all<{ id: string; year_level: string | null }>(
    'SELECT id, year_level FROM student WHERE archived_at IS NULL AND active = 1'
  )
  let promoted = 0
  let left = 0
  for (const r of rows) {
    if (r.year_level === null || !/^\d+$/.test(r.year_level)) continue
    const y = Number(r.year_level)
    if (y >= last) {
      db.run(
        'UPDATE student SET active = 0, left_at = $now, updated_at = $now, updated_by = $by WHERE id = $id',
        { $id: r.id, $now: now, $by: ctx.operator }
      )
      left++
    } else {
      db.run(
        'UPDATE student SET year_level = $y, updated_at = $now, updated_by = $by WHERE id = $id',
        { $id: r.id, $y: String(y + 1), $now: now, $by: ctx.operator }
      )
      promoted++
    }
  }
  setSetting(db, ctx, PROGRESS_KEY, { ...p, promoted: true } satisfies Progress)
  return { promoted, left }
}

export function finishRollover(db: LockerDb): void {
  db.run('DELETE FROM settings WHERE key = $k', { $k: PROGRESS_KEY })
}
