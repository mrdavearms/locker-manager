import type { LockerDb } from '../db/db'

// What an older version of the file must not take away when it replaces the current
// one (undo, redo, restoring a backup). History, code reveals and print records are
// append-only, so lines written since the older version are copied into it. The PIN
// is kept too: putting back a version from before the PIN was set would otherwise
// remove it, which undo already refuses to do. Electron-free.

const APPEND_ONLY = ['audit_log', 'code_reveal_log', 'print_job'] as const

/**
 * Copies every history, reveal and print row in `from` that `into` lacks. A reveal
 * line's student or locker is cleared when `into` lacks it: a link to nothing made
 * every later migration refuse the file (docs/audits/2026-10-20-stability-audit.md,
 * finding 1). The caller turns the link check off around this and runs it in a
 * transaction.
 */
export function carryAppendOnly(from: LockerDb, into: LockerDb): void {
  const has = (table: 'student' | 'locker', id: unknown): boolean =>
    typeof id === 'string' &&
    into.get(`SELECT 1 AS x FROM ${table} WHERE id = $id`, { $id: id }) !== undefined
  for (const table of APPEND_ONLY) {
    const cols = into.all<{ name: string }>(`PRAGMA table_info(${table})`).map((r) => r.name)
    const fromCols = new Set(
      from.all<{ name: string }>(`PRAGMA table_info(${table})`).map((r) => r.name)
    )
    if (cols.length === 0 || fromCols.size === 0) continue
    const have = new Set(into.all<{ id: string }>(`SELECT id FROM ${table}`).map((r) => r.id))
    for (const row of from.all<Record<string, string | number | null>>(`SELECT * FROM ${table}`)) {
      if (have.has(String(row.id))) continue
      if (table === 'code_reveal_log') {
        if (row.student_id != null && !has('student', row.student_id)) row.student_id = null
        if (row.locker_id != null && !has('locker', row.locker_id)) row.locker_id = null
      }
      into.run(
        `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map((_, i) => `$c${i}`).join(', ')})`,
        Object.fromEntries(cols.map((c, i) => [`$c${i}`, row[c] ?? null]))
      )
    }
  }
}

/** Makes `into` hold the same PIN setting as `from` (or none, if `from` has none). */
export function keepPrivacy(from: LockerDb, into: LockerDb): void {
  const row = from.get<Record<string, string | number>>(
    "SELECT * FROM settings WHERE key = 'privacy'"
  )
  into.run("DELETE FROM settings WHERE key = 'privacy'")
  if (!row) return
  const cols = Object.keys(row)
  into.run(
    `INSERT INTO settings (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map((_, i) => `$c${i}`).join(', ')})`,
    Object.fromEntries(cols.map((c, i) => [`$c${i}`, row[c] ?? null]))
  )
}
