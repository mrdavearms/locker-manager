import { z } from 'zod'
import type {
  ExclusionView,
  GroupView,
  StudentCounts,
  StudentFilter,
  StudentView
} from '@shared/students'
import type { LockerDb } from '../db/db'
import { newId, stamp, type OperatorContext } from '../db/context'
import { displayGroup, normaliseYearLevel, yearFromGroup } from '../import/groups'
import { needsCaseFix, tidy, toNameCase } from '../import/nameCase'
import { getSetting, setSetting } from './settings'

export const GroupMapSchema = z.record(z.string(), z.string())
export const SortLastSchema = z.array(z.string())

export function groupMap(db: LockerDb): Record<string, string> {
  return getSetting(db, 'groups.displayMap', GroupMapSchema, {})
}

/** WHS default: the HUB group is placed after the others (SPEC.md 4.4). */
export function sortLastGroups(db: LockerDb): string[] {
  return getSetting(db, 'groups.sortLast', SortLastSchema, ['HUB'])
}

type Row = {
  id: string
  external_id: string
  first_name: string
  last_name: string
  preferred_name: string | null
  first_name_raw: string
  last_name_raw: string
  name_override: number
  name_check: string
  year_level: string | null
  group_code: string | null
  house: string | null
  needs_accessible: number
  active: number
  left_at: string | null
  not_in_import_since: string | null
  locker_id: string | null
  locker_number: string | null
  excluded_reason: string | null
  custom: string | null
}

const SELECT = `
  SELECT s.id, s.external_id, s.first_name, s.last_name, s.preferred_name, s.first_name_raw, s.last_name_raw,
         s.name_override, s.name_check, s.year_level, s.group_code, s.house, s.needs_accessible, s.active,
         s.left_at, s.not_in_import_since, s.custom,
         l.id AS locker_id, l.number AS locker_number,
         COALESCE(
           (SELECT e.reason FROM exclusion e WHERE e.kind = 'student' AND e.value = s.external_id),
           (SELECT e.reason FROM exclusion e WHERE e.kind = 'group' AND e.value = s.group_code),
           (SELECT e.reason FROM exclusion e WHERE e.kind = 'year_level' AND e.value = s.year_level)
         ) AS excluded_reason
    FROM student s
    LEFT JOIN assignment a ON a.student_id = s.id AND a.status = 'current'
    LEFT JOIN locker l ON l.id = a.locker_id
   WHERE s.archived_at IS NULL`

function toView(r: Row, map: Record<string, string>): StudentView {
  let check: string[] = []
  try {
    const v: unknown = JSON.parse(r.name_check)
    if (Array.isArray(v)) check = v.filter((x): x is string => typeof x === 'string')
  } catch {
    check = []
  }
  return {
    id: r.id,
    externalId: r.external_id,
    firstName: r.first_name,
    lastName: r.last_name,
    preferredName: r.preferred_name,
    displayName: `${r.preferred_name || r.first_name} ${r.last_name}`,
    firstNameRaw: r.first_name_raw,
    lastNameRaw: r.last_name_raw,
    nameOverride: r.name_override === 1,
    nameCheck: check,
    yearLevel: r.year_level,
    groupCode: r.group_code,
    groupDisplay: displayGroup(r.group_code, map),
    house: r.house,
    needsAccessible: r.needs_accessible === 1,
    active: r.active === 1,
    leftAt: r.left_at,
    notInImportSince: r.not_in_import_since,
    locker: r.locker_id && r.locker_number ? { id: r.locker_id, number: r.locker_number } : null,
    excludedReason: r.excluded_reason,
    language: languageOf(r.custom)
  }
}

function languageOf(custom: string | null): string | null {
  try {
    const v: unknown = JSON.parse(custom || '{}')
    if (v && typeof v === 'object' && 'language' in v) {
      const l = (v as { language: unknown }).language
      return typeof l === 'string' ? l : null
    }
  } catch {
    return null
  }
  return null
}

const FILTERS: Record<StudentFilter, string> = {
  current: 's.active = 1',
  possible_leavers: 's.active = 1 AND s.not_in_import_since IS NOT NULL',
  name_check: "s.active = 1 AND s.name_check <> '[]'",
  no_locker: 's.active = 1 AND l.id IS NULL',
  left: 's.active = 0',
  all: '1 = 1'
}

export function listStudents(
  db: LockerDb,
  opts: { filter: StudentFilter; search?: string; yearLevel?: string; group?: string }
): StudentView[] {
  const where = [FILTERS[opts.filter]]
  const params: Record<string, string> = {}
  if (opts.search?.trim()) {
    where.push(`(lower(s.first_name || ' ' || s.last_name) LIKE $q OR lower(COALESCE(s.preferred_name,'') || ' ' || s.last_name) LIKE $q
                 OR lower(s.external_id) LIKE $q OR lower(COALESCE(l.number, '')) = $exact)`)
    params.$q = `%${opts.search.trim().toLowerCase()}%`
    params.$exact = opts.search.trim().toLowerCase()
  }
  if (opts.yearLevel) {
    where.push('s.year_level = $y')
    params.$y = opts.yearLevel
  }
  if (opts.group) {
    where.push('s.group_code = $g')
    params.$g = opts.group
  }
  const map = groupMap(db)
  return db
    .all<Row>(
      `${SELECT} AND ${where.join(' AND ')} ORDER BY CAST(s.year_level AS INTEGER), s.year_level, s.group_code, s.last_name COLLATE NOCASE, s.first_name COLLATE NOCASE LIMIT 5000`,
      params
    )
    .map((r) => toView(r, map))
}

export function getStudent(db: LockerDb, id: string): StudentView | null {
  const r = db.get<Row>(`${SELECT} AND s.id = $id`, { $id: id })
  return r ? toView(r, groupMap(db)) : null
}

export function studentCounts(db: LockerDb): StudentCounts {
  const n = (f: StudentFilter): number =>
    Number(
      db.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM student s LEFT JOIN assignment a ON a.student_id = s.id AND a.status = 'current'
           LEFT JOIN locker l ON l.id = a.locker_id WHERE s.archived_at IS NULL AND ${FILTERS[f]}`
      )?.n ?? 0
    )
  return {
    current: n('current'),
    possibleLeavers: n('possible_leavers'),
    nameCheck: n('name_check'),
    noLocker: n('no_locker'),
    left: n('left')
  }
}

/**
 * An operator's correction to a name. It is never replaced by a later import
 * (SPEC.md 3.5). Names are only ever edited on the student record, so a name can
 * never drift away from its student ID (SPEC.md section 15, item 2).
 */
export function updateStudent(
  db: LockerDb,
  ctx: OperatorContext,
  id: string,
  patch: {
    firstName?: string
    lastName?: string
    preferredName?: string | null
    needsAccessible?: boolean
    confirmName?: boolean
  }
): StudentView {
  const current = getStudent(db, id)
  if (!current) throw new Error('That student is no longer in the file.')
  const first = patch.firstName !== undefined ? tidy(patch.firstName) : null
  const last = patch.lastName !== undefined ? tidy(patch.lastName) : null
  if (first === '' || last === '') throw new Error('A student needs a first and last name.')
  const nameChanged =
    (first !== null && first !== current.firstName) || (last !== null && last !== current.lastName)
  const s = stamp(ctx)
  db.run(
    `UPDATE student SET
       first_name = COALESCE($f, first_name), last_name = COALESCE($l, last_name),
       preferred_name = CASE WHEN $setP THEN $p ELSE preferred_name END,
       name_override = CASE WHEN $override THEN 1 ELSE name_override END,
       name_check = CASE WHEN $confirm OR $override THEN '[]' ELSE name_check END,
       needs_accessible = COALESCE($acc, needs_accessible),
       updated_at = $u, updated_by = $by
     WHERE id = $id`,
    {
      $id: id,
      $f: first,
      $l: last,
      $setP: patch.preferredName !== undefined ? 1 : 0,
      $p: patch.preferredName ? tidy(patch.preferredName) : null,
      $override: nameChanged ? 1 : 0,
      $confirm: patch.confirmName ? 1 : 0,
      $acc: patch.needsAccessible === undefined ? null : patch.needsAccessible ? 1 : 0,
      $u: s.updated_at,
      $by: s.updated_by
    }
  )
  return getStudent(db, id)!
}

/** The student is confirmed as still enrolled: off the possible-leavers list. */
export function markStillHere(db: LockerDb, ctx: OperatorContext, id: string): void {
  db.run(
    'UPDATE student SET not_in_import_since = NULL, updated_at = $u, updated_by = $by WHERE id = $id',
    { $id: id, $u: ctx.now().toISOString(), $by: ctx.operator }
  )
}

/** The student has left. A student holding a locker is released through "Student has left" instead. */
export function confirmLeft(db: LockerDb, ctx: OperatorContext, id: string): void {
  if (
    db.get("SELECT 1 FROM assignment WHERE student_id = $id AND status = 'current'", { $id: id })
  ) {
    throw new Error(
      'This student still holds a locker. Use "Student has left" so the locker is freed and its code changed.'
    )
  }
  const at = ctx.now().toISOString()
  db.run(
    'UPDATE student SET active = 0, left_at = $day, updated_at = $at, updated_by = $by WHERE id = $id',
    { $id: id, $day: at.slice(0, 10), $at: at, $by: ctx.operator }
  )
}

export function listExclusions(db: LockerDb): ExclusionView[] {
  return db
    .all<{
      id: string
      kind: ExclusionView['kind']
      value: string
      reason: string
      name: string | null
    }>(
      `SELECT e.id, e.kind, e.value, e.reason,
              (SELECT s.first_name || ' ' || s.last_name FROM student s WHERE e.kind = 'student' AND s.external_id = e.value) AS name
         FROM exclusion e ORDER BY e.kind, e.value`
    )
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      value: r.value,
      reason: r.reason,
      label: r.name ? `${r.name} (${r.value})` : r.value
    }))
}

export function addExclusion(
  db: LockerDb,
  ctx: OperatorContext,
  kind: ExclusionView['kind'],
  value: string,
  reason: string
): string {
  const v = value.trim()
  const why = reason.trim()
  if (!v) throw new Error('Say who or what to exclude.')
  if (why.length < 3) throw new Error('Give a short reason.')
  if (db.get('SELECT 1 FROM exclusion WHERE kind = $k AND value = $v', { $k: kind, $v: v }))
    throw new Error('That is already excluded.')
  const id = newId()
  const s = stamp(ctx)
  db.run(
    'INSERT INTO exclusion (id, kind, value, reason, created_at, updated_at, updated_by) VALUES ($id, $k, $v, $r, $c, $c, $by)',
    { $id: id, $k: kind, $v: v, $r: why, $c: s.created_at, $by: s.updated_by }
  )
  return id
}

export function removeExclusion(db: LockerDb, id: string): void {
  db.run('DELETE FROM exclusion WHERE id = $id', { $id: id })
}

export function listGroups(db: LockerDb): GroupView[] {
  const map = groupMap(db)
  const last = new Set(sortLastGroups(db))
  const excluded = new Set(
    db
      .all<{ value: string }>("SELECT value FROM exclusion WHERE kind = 'group'")
      .map((r) => r.value)
  )
  return db
    .all<{ code: string; year_level: string | null; n: number }>(
      `SELECT group_code AS code, MAX(year_level) AS year_level, COUNT(*) AS n FROM student
        WHERE archived_at IS NULL AND active = 1 AND group_code IS NOT NULL GROUP BY group_code`
    )
    .map((g) => ({
      code: g.code,
      display: displayGroup(g.code, map) ?? g.code,
      yearLevel: g.year_level ?? yearFromGroup(g.code),
      students: Number(g.n),
      sortLast: last.has(g.code),
      excluded: excluded.has(g.code)
    }))
    .sort((a, b) => a.code.localeCompare(b.code, 'en-AU', { numeric: true }))
}

export function setGroupDisplay(
  db: LockerDb,
  ctx: OperatorContext,
  code: string,
  display: string | null
): void {
  const map = { ...groupMap(db) }
  if (display && display.trim()) map[code] = display.trim()
  else delete map[code]
  setSetting(db, ctx, 'groups.displayMap', map)
}

export function setGroupSortLast(
  db: LockerDb,
  ctx: OperatorContext,
  code: string,
  sortLast: boolean
): void {
  const set = new Set(sortLastGroups(db))
  if (sortLast) set.add(code)
  else set.delete(code)
  setSetting(db, ctx, 'groups.sortLast', [...set].sort())
}

/**
 * A student added by hand (a mid-year enrolment before the next import). The
 * student ID is the key a later import matches on, so it is required and unique.
 */
export function createStudent(
  db: LockerDb,
  ctx: OperatorContext,
  input: {
    externalId: string
    firstName: string
    lastName: string
    preferredName: string | null
    yearLevel: string | null
    groupCode: string | null
  }
): string {
  const ext = input.externalId.trim()
  if (!ext) throw new Error('Type their student ID, exactly as in your student system.')
  if (db.get('SELECT 1 FROM student WHERE external_id = $e', { $e: ext }))
    throw new Error(`Student ID ${ext} is already in the file. Use Find to look them up.`)
  const fix = (n: string, isSurname: boolean): string =>
    needsCaseFix(n) ? toNameCase(n, { particles: 'capital', isSurname }).value : n
  const first = fix(tidy(input.firstName), false)
  const last = fix(tidy(input.lastName), true)
  if (!first || !last) throw new Error('A student needs a first and last name.')
  const group = input.groupCode?.trim() || null
  const year = input.yearLevel?.trim()
    ? normaliseYearLevel(input.yearLevel)
    : group
      ? yearFromGroup(group)
      : null
  const id = newId()
  const s = stamp(ctx)
  const today = s.created_at.slice(0, 10)
  db.run(
    `INSERT INTO student (id, external_id, first_name_raw, last_name_raw, first_name, last_name, preferred_name,
                          year_level, group_code, name_check, first_seen, last_seen, created_at, updated_at, updated_by)
     VALUES ($id, $e, $fr, $lr, $f, $l, $p, $y, $g, '[]', $d, $d, $c, $c, $by)`,
    {
      $id: id,
      $e: ext,
      $fr: input.firstName.trim(),
      $lr: input.lastName.trim(),
      $f: first,
      $l: last,
      $p: input.preferredName?.trim() || null,
      $y: year,
      $g: group,
      $d: today,
      $c: s.created_at,
      $by: s.updated_by
    }
  )
  return id
}
