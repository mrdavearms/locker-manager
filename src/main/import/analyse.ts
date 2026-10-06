import {
  type ChangedStudent,
  type FieldChange,
  type FileSettings,
  type ImportAnalysis,
  type ImportedStudentView,
  type ImportOptions,
  type ImportProblem,
  type LeaverCandidate
} from '@shared/importTypes'
import type { LockerDb } from '../db/db'
import { displayGroup, normaliseYearLevel, yearFromGroup } from './groups'
import { NAME_FLAG_TEXT, tidy, toNameCase, type NameFlag } from './nameCase'
import type { ParsedFile } from './parse'

// From parsed files to a checked list of students and a comparison with the
// students already in the data file (SPEC.md 4.2 steps 4 to 6). Nothing here
// writes: the operator ticks what to apply.

const FOOTER = /^(total|totals|count|records?|students?|end of report|page \d+)\b/i

interface Built {
  students: ImportedStudentView[]
  problems: ImportProblem[]
}

/** Turns each file's rows into students, with problems found on the way. */
export function buildStudents(
  files: readonly ParsedFile[],
  settings: readonly FileSettings[],
  opts: ImportOptions
): Built {
  const students: ImportedStudentView[] = []
  const problems: ImportProblem[] = []
  const seenAcross = new Map<string, string>()

  files.forEach((file, fi) => {
    const s = settings[fi]
    if (!s) return
    const sheet = file.sheets[s.sheetIndex]
    if (!sheet) return
    const m = s.mapping
    const seenHere = new Set<string>()
    const cell = (row: readonly string[], idx: number | undefined): string =>
      idx === undefined ? '' : tidy(row[idx])
    for (let r = s.headerRow + 1; r < sheet.rows.length; r++) {
      const row = sheet.rows[r] ?? []
      const rowNo = r + 1
      if (row.every((c) => tidy(c) === '')) continue
      const id = cell(row, m.externalId)
      const first = cell(row, m.firstName)
      const last = cell(row, m.lastName)
      if (first === '' && last === '') {
        const text = row.map((c) => tidy(c)).filter(Boolean)
        if (text.some((t) => FOOTER.test(t)) || text.every((t) => /^[\d.,\s]+$/.test(t))) {
          problems.push({
            kind: 'footer_row',
            severity: 'info',
            fileName: file.fileName,
            row: rowNo,
            message: `Skipped a row that looks like a total or footer: "${text.join(' ').slice(0, 60)}"`
          })
          continue
        }
      }
      if (id === '') {
        const text = row.map((c) => tidy(c)).filter(Boolean)
        if (text.some((t) => FOOTER.test(t)) || text.every((t) => /^[\d.,\s]+$/.test(t))) {
          problems.push({
            kind: 'footer_row',
            severity: 'info',
            fileName: file.fileName,
            row: rowNo,
            message: `Skipped a row that looks like a total or footer: "${text.join(' ').slice(0, 60)}"`
          })
        } else {
          problems.push({
            kind: 'blank_id',
            severity: 'error',
            fileName: file.fileName,
            row: rowNo,
            message: 'No student ID, so this row was skipped.'
          })
        }
        continue
      }
      if (first === '' && last === '') {
        problems.push({
          kind: 'blank_name',
          severity: 'error',
          fileName: file.fileName,
          row: rowNo,
          message: `Student ${id} has no name, so this row was skipped.`
        })
        continue
      }
      if (seenHere.has(id)) {
        problems.push({
          kind: 'duplicate_in_file',
          severity: 'error',
          fileName: file.fileName,
          row: rowNo,
          message: `Student ID ${id} appears more than once in this file. Only the first was used.`
        })
        continue
      }
      const other = seenAcross.get(id)
      if (other !== undefined) {
        problems.push({
          kind: 'duplicate_across_files',
          severity: 'error',
          fileName: file.fileName,
          row: rowNo,
          message: `Student ID ${id} is also in ${other}. Only the first was used.`
        })
        continue
      }
      seenHere.add(id)
      seenAcross.set(id, file.fileName)

      const firstCased = toNameCase(first, { particles: opts.particles, isSurname: false })
      const lastCased = toNameCase(last, { particles: opts.particles, isSurname: true })
      const groupCode = cell(row, m.group) || null
      const fromColumn = normaliseYearLevel(cell(row, m.yearLevel) || null)
      const fromGroup = yearFromGroup(groupCode)
      const yearLevel =
        s.yearSource === 'fixed' ? s.fixedYear : s.yearSource === 'group' ? fromGroup : fromColumn
      // SPEC.md section 15, item 5: a Year 8 student in the Year 7 file.
      const evidence = [fromColumn, fromGroup].filter((x): x is string => x !== null)
      const yearConflict = yearLevel ? (evidence.find((e) => e !== yearLevel) ?? null) : null
      if (yearConflict) {
        problems.push({
          kind: 'wrong_year_level',
          severity: 'warning',
          fileName: file.fileName,
          row: rowNo,
          message: `${firstCased.value} ${lastCased.value} (${id}) looks like year ${evidence.find((e) => e !== yearLevel)} but is in a file for year ${yearLevel}. Check before importing.`
        })
      }
      const preferredRaw = cell(row, m.preferredName) || null
      const preferred = preferredRaw
        ? toNameCase(preferredRaw, { particles: opts.particles, isSurname: false }).value
        : null
      const flags = [...new Set<NameFlag>([...firstCased.flags, ...lastCased.flags])]
      const student: ImportedStudentView = {
        externalId: id,
        firstNameRaw: first,
        lastNameRaw: last,
        preferredNameRaw: preferredRaw,
        firstName: firstCased.value,
        lastName: lastCased.value,
        preferredName: preferred && preferred !== firstCased.value ? preferred : null,
        yearLevel,
        groupCode,
        groupDisplay: displayGroup(groupCode, opts.groupMap),
        house: cell(row, m.house) || null,
        gender: cell(row, m.gender) || null,
        email: cell(row, m.email) || null,
        nameCheck: flags,
        yearConflict,
        fileName: file.fileName,
        row: rowNo
      }
      for (const f of flags) {
        problems.push({
          kind: 'name_check',
          severity: 'info',
          fileName: file.fileName,
          row: rowNo,
          message: `${student.firstName} ${student.lastName}: ${NAME_FLAG_TEXT[f]}.`
        })
      }
      students.push(student)
    }
  })
  return { students, problems }
}

interface ExistingStudent {
  id: string
  external_id: string
  first_name_raw: string
  last_name_raw: string
  first_name: string
  last_name: string
  preferred_name: string | null
  name_override: number
  year_level: string | null
  group_code: string | null
  house: string | null
  gender: string | null
  email: string | null
  active: number
  holds: number
}

/** Compares imported students with the data file: new, changed, possible leavers, unchanged. */
export function analyseImport(db: LockerDb, built: Built, opts: ImportOptions): ImportAnalysis {
  const existing = db.all<ExistingStudent>(
    `SELECT s.id, s.external_id, s.first_name_raw, s.last_name_raw, s.first_name, s.last_name, s.preferred_name,
            s.name_override, s.year_level, s.group_code, s.house, s.gender, s.email, s.active,
            EXISTS (SELECT 1 FROM assignment a WHERE a.student_id = s.id AND a.status = 'current') AS holds
       FROM student s WHERE s.archived_at IS NULL`
  )
  const byId = new Map(existing.map((e) => [e.external_id, e]))
  const knownGroups = new Set(
    existing.map((e) => e.group_code).filter((g): g is string => g !== null)
  )
  const excludedGroups = new Set(
    db
      .all<{ value: string }>("SELECT value FROM exclusion WHERE kind = 'group'")
      .map((r) => r.value)
  )
  const excludedIds = new Set(
    db
      .all<{ value: string }>("SELECT value FROM exclusion WHERE kind = 'student'")
      .map((r) => r.value)
  )
  const excludedYears = new Set(
    db
      .all<{ value: string }>("SELECT value FROM exclusion WHERE kind = 'year_level'")
      .map((r) => r.value)
  )
  const problems = [...built.problems]

  const newStudents: ImportedStudentView[] = []
  const changed: ChangedStudent[] = []
  let unchanged = 0
  for (const s of built.students) {
    if (
      (s.groupCode && excludedGroups.has(s.groupCode)) ||
      excludedIds.has(s.externalId) ||
      (s.yearLevel && excludedYears.has(s.yearLevel))
    ) {
      problems.push({
        kind: 'excluded',
        severity: 'info',
        fileName: s.fileName,
        row: s.row,
        message: `${s.firstName} ${s.lastName} is imported but never gets a locker (on the exclusions list).`
      })
    }
    const e = byId.get(s.externalId)
    if (!e) {
      newStudents.push(s)
      continue
    }
    const changes: FieldChange[] = []
    let overrideKept = false
    const curName = `${e.first_name} ${e.last_name}`
    const newName = `${s.firstName} ${s.lastName}`
    if (e.name_override === 1) {
      if (e.first_name_raw !== s.firstNameRaw || e.last_name_raw !== s.lastNameRaw)
        overrideKept = true
    } else if (curName !== newName) {
      changes.push({ field: 'name', from: curName, to: newName })
    }
    const cmp = (field: FieldChange['field'], from: string | null, to: string | null): void => {
      if ((from ?? '') !== (to ?? '')) changes.push({ field, from, to })
    }
    cmp('yearLevel', e.year_level, s.yearLevel)
    cmp('group', e.group_code, s.groupCode)
    if (s.house !== null) cmp('house', e.house, s.house)
    if (s.gender !== null) cmp('gender', e.gender, s.gender)
    if (s.email !== null) cmp('email', e.email, s.email)
    if (e.active === 0) changes.push({ field: 'returning', from: 'left', to: 'enrolled' })
    if (changes.length === 0 && !overrideKept) unchanged++
    else
      changed.push({
        studentId: e.id,
        externalId: e.external_id,
        name: curName,
        changes,
        overrideKept,
        yearConflict: s.yearConflict
      })
  }

  const yearLevelsCovered = [
    ...new Set(built.students.map((s) => s.yearLevel).filter((y): y is string => y !== null))
  ].sort((a, b) => Number(a) - Number(b))
  const importedIds = new Set(built.students.map((s) => s.externalId))
  const leavers: LeaverCandidate[] = existing
    .filter((e) => e.active === 1 && !importedIds.has(e.external_id))
    // Only year levels this import covers, unless it is the whole school.
    .filter(
      (e) => opts.wholeSchool || (e.year_level !== null && yearLevelsCovered.includes(e.year_level))
    )
    .map((e) => ({
      studentId: e.id,
      externalId: e.external_id,
      name: `${e.first_name} ${e.last_name}`,
      yearLevel: e.year_level,
      groupCode: e.group_code,
      holdsLocker: e.holds === 1
    }))

  const groupCounts = new Map<string, { display: string; count: number }>()
  for (const s of built.students) {
    if (!s.groupCode) continue
    const g = groupCounts.get(s.groupCode) ?? { display: s.groupDisplay ?? s.groupCode, count: 0 }
    g.count++
    groupCounts.set(s.groupCode, g)
  }
  const groupsSeen = [...groupCounts.entries()]
    .map(([code, g]) => ({
      code,
      display: g.display,
      count: g.count,
      known: knownGroups.has(code)
    }))
    .sort((a, b) => a.code.localeCompare(b.code, 'en-AU', { numeric: true }))
  if (knownGroups.size > 0) {
    for (const g of groupsSeen.filter((x) => !x.known)) {
      problems.push({
        kind: 'new_group',
        severity: 'warning',
        fileName: '',
        row: 0,
        message: `Group ${g.code} has not been seen before (${g.count} students). Check it is right.`
      })
    }
  }

  return {
    students: built.students,
    problems,
    newStudents,
    changed,
    leavers,
    unchanged,
    yearLevelsCovered,
    groupsSeen
  }
}
