import type { LockerDb } from './db'
import { getMeta } from './context'

export interface FileSummary {
  fileId: string | null
  schoolName: string
  demo: boolean
  /** A practice copy of a school's file (SPEC.md 10): it never saves back. */
  practice: boolean
  /** A practice copy made on a computer that was not editing: it holds no codes. */
  practiceNoCodes: boolean
  schemaVersion: number
  counts: {
    students: number
    lockers: number
    currentAssignments: number
    locks: number
    historyEntries: number
  }
  lastChange: { at: string; operator: string; machine: string; action: string } | null
}

function count(db: LockerDb, sql: string): number {
  const row = db.get<{ n: number }>(sql)
  return Number(row?.n ?? 0)
}

/** A short description of a data file, for status panels, conflicts and restores. */
export function summarise(db: LockerDb): FileSummary {
  const school = db.get<{ name: string }>('SELECT name FROM school LIMIT 1')
  const last = db.get<{ at: string; operator: string; machine: string; action: string }>(
    'SELECT at, operator, machine, action FROM audit_log ORDER BY at DESC, rowid DESC LIMIT 1'
  )
  return {
    fileId: getMeta(db, 'file_id') ?? null,
    schoolName: school?.name ?? '(no name)',
    demo: getMeta(db, 'demo') === '1',
    practice: getMeta(db, 'practice') === '1',
    practiceNoCodes: getMeta(db, 'practice_no_codes') === '1',
    schemaVersion: db.userVersion,
    counts: {
      students: count(db, 'SELECT COUNT(*) AS n FROM student WHERE archived_at IS NULL'),
      lockers: count(db, 'SELECT COUNT(*) AS n FROM locker WHERE archived_at IS NULL'),
      currentAssignments: count(
        db,
        "SELECT COUNT(*) AS n FROM assignment WHERE status = 'current'"
      ),
      locks: count(db, 'SELECT COUNT(*) AS n FROM lock'),
      historyEntries: count(db, 'SELECT COUNT(*) AS n FROM audit_log')
    },
    lastChange: last
      ? {
          at: String(last.at),
          operator: String(last.operator),
          machine: String(last.machine),
          action: String(last.action)
        }
      : null
  }
}

export interface HistoryLine {
  id: string
  at: string
  operator: string
  machine: string
  action: string
  entity: string
}

/**
 * History entries in one version that the other lacks. The audit log is
 * append-only with unique ids, so this shows what each side did since they split.
 */
export function historyOnlyIn(a: LockerDb, b: LockerDb, limit = 50): HistoryLine[] {
  const bIds = new Set(b.all<{ id: string }>('SELECT id FROM audit_log').map((r) => String(r.id)))
  return a
    .all<{
      id: string
      at: string
      operator: string
      machine: string
      action: string
      entity: string
    }>(
      'SELECT id, at, operator, machine, action, entity FROM audit_log ORDER BY at DESC, rowid DESC'
    )
    .filter((r) => !bIds.has(String(r.id)))
    .slice(0, limit)
    .map((r) => ({
      id: String(r.id),
      at: String(r.at),
      operator: String(r.operator),
      machine: String(r.machine),
      action: String(r.action),
      entity: String(r.entity)
    }))
}
