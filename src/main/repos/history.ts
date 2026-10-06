import type { HistoryEntryView, QuickResult } from '@shared/history'
import type { LockerDb } from '../db/db'

// The history screen and quick search (SPEC.md 4.11 and 4.12). History lines
// never contain codes; names are looked up live from the records they point at.

export function listHistory(
  db: LockerDb,
  opts: { search?: string; limit: number; before?: string }
): HistoryEntryView[] {
  const where: string[] = []
  const params: Record<string, string | number> = { $limit: opts.limit }
  if (opts.before) {
    where.push('h.at < $before')
    params.$before = opts.before
  }
  if (opts.search?.trim()) {
    where.push(`(lower(h.operator) LIKE $q OR lower(h.action) LIKE $q OR lower(COALESCE(h.reason,'')) LIKE $q
                OR lower(COALESCE(s.first_name || ' ' || s.last_name, '')) LIKE $q OR lower(COALESCE(l.number, '')) = $exact)`)
    params.$q = `%${opts.search.trim().toLowerCase()}%`
    params.$exact = opts.search.trim().toLowerCase()
  }
  return db
    .all<{
      id: string
      at: string
      operator: string
      machine: string
      action: string
      entity: string
      entity_id: string | null
      reason: string | null
      sname: string | null
      lnum: string | null
    }>(
      `SELECT h.id, h.at, h.operator, h.machine, h.action, h.entity, h.entity_id, h.reason,
              COALESCE(s.preferred_name, s.first_name) || ' ' || s.last_name AS sname, l.number AS lnum
         FROM audit_log h
         LEFT JOIN student s ON h.entity = 'student' AND s.id = h.entity_id
         LEFT JOIN locker l ON h.entity = 'locker' AND l.id = h.entity_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY h.at DESC, h.rowid DESC LIMIT $limit`,
      params
    )
    .map((r) => ({
      id: r.id,
      at: r.at,
      operator: r.operator,
      machine: r.machine,
      action: r.action,
      entity: r.entity,
      entityId: r.entity_id,
      reason: r.reason,
      detail: r.sname ?? (r.lnum ? `Locker ${r.lnum}` : null)
    }))
}

export function quickSearch(db: LockerDb, q: string): QuickResult[] {
  const t = q.trim().toLowerCase()
  if (t.length === 0) return []
  const like = `%${t}%`
  const students = db
    .all<{
      id: string
      name: string
      external_id: string
      group_code: string | null
      year_level: string | null
      locker_id: string | null
      number: string | null
      active: number
    }>(
      `SELECT s.id, COALESCE(s.preferred_name, s.first_name) || ' ' || s.last_name AS name, s.external_id, s.group_code, s.year_level, s.active,
              l.id AS locker_id, l.number
         FROM student s
         LEFT JOIN assignment a ON a.student_id = s.id AND a.status = 'current'
         LEFT JOIN locker l ON l.id = a.locker_id
        WHERE s.archived_at IS NULL
          AND (lower(s.first_name || ' ' || s.last_name) LIKE $q OR lower(COALESCE(s.preferred_name, '') || ' ' || s.last_name) LIKE $q
               OR lower(s.last_name || ' ' || s.first_name) LIKE $q OR lower(s.external_id) LIKE $q)
        ORDER BY s.active DESC, s.last_name, s.first_name LIMIT 12`,
      { $q: like }
    )
    .map((s): QuickResult => ({
      kind: 'student',
      id: s.id,
      title: s.name,
      subtitle: [
        s.external_id,
        s.year_level ? `Year ${s.year_level}` : null,
        s.group_code,
        s.number ? `Locker ${s.number}` : 'no locker',
        s.active ? null : 'left'
      ]
        .filter(Boolean)
        .join(' · '),
      lockerId: s.locker_id,
      studentId: s.id
    }))
  const lockers = db
    .all<{
      id: string
      number: string
      holder: string | null
      student_id: string | null
      serial: string | null
      key_number: string | null
    }>(
      `SELECT l.id, l.number, k.serial_number AS serial, k.key_number,
              (SELECT COALESCE(s.preferred_name, s.first_name) || ' ' || s.last_name FROM assignment a JOIN student s ON s.id = a.student_id WHERE a.locker_id = l.id AND a.status = 'current' LIMIT 1) AS holder,
              (SELECT a.student_id FROM assignment a WHERE a.locker_id = l.id AND a.status = 'current' LIMIT 1) AS student_id
         FROM locker l LEFT JOIN lock k ON k.locker_id = l.id AND k.status IN ('in_use','spare')
        WHERE l.archived_at IS NULL AND (lower(l.number) = $exact OR lower(COALESCE(k.serial_number,'')) = $exact OR lower(COALESCE(k.key_number,'')) = $exact)
        LIMIT 5`,
      { $exact: t }
    )
    .map((l): QuickResult => ({
      kind: 'locker',
      id: l.id,
      title: `Locker ${l.number}`,
      subtitle: l.holder ?? 'Spare',
      lockerId: l.id,
      studentId: l.student_id
    }))
  return [...lockers, ...students]
}
