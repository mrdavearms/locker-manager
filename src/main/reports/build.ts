import { describeAction } from '@shared/history'
import { LOCK_TYPE_INFO, type LockType } from '@shared/locks'
import { REPORTS, type ReportData, type ReportRequest, type ReportSection } from '@shared/reports'
import type { CodeStatus } from '@shared/codes'
import type { Terminology } from '@shared/terminology'
import type { LockerDb } from '../db/db'
import { decryptCode, readCodeKey } from '../codes/cipher'
import { compareLockerNumbers } from '../locations/lockerNumbers'
import { getTerms } from '../repos/school'
import { listGroups } from '../repos/students'

// The data behind every list and report (SPEC.md 4.9). Pure reads of the file.
// Codes are only decrypted when the request asks for them; the caller decides
// whether to mask them (screen) or record that they were revealed (print, export).

export interface BuiltReport extends ReportData {
  /** Lockers whose code appears in the report, for the reveal log. */
  revealedLockers: string[]
}

interface Holder {
  locker_id: string
  number: string
  sort_key: string
  area: string
  bank: string
  student_id: string
  first_name: string
  preferred_name: string | null
  last_name: string
  group_code: string | null
  year_level: string | null
}

const name = (r: {
  first_name: string
  preferred_name: string | null
  last_name: string
}): string => `${r.last_name}, ${r.preferred_name || r.first_name}`

function groupOrder(db: LockerDb): { order: Map<string, number>; display: Map<string, string> } {
  const groups = listGroups(db)
  const sorted = [...groups.filter((g) => !g.sortLast), ...groups.filter((g) => g.sortLast)]
  return {
    order: new Map(sorted.map((g, i) => [g.code, i])),
    display: new Map(groups.map((g) => [g.code, g.display]))
  }
}

function holders(db: LockerDb): Holder[] {
  return db.all<Holder>(
    `SELECT l.id AS locker_id, l.number, l.sort_key, a.name AS area, b.name AS bank,
            s.id AS student_id, s.first_name, s.preferred_name, s.last_name, s.group_code, s.year_level
       FROM assignment x JOIN student s ON s.id = x.student_id
       JOIN locker l ON l.id = x.locker_id JOIN bank b ON b.id = l.bank_id JOIN area a ON a.id = b.area_id
      WHERE x.status = 'current' AND l.archived_at IS NULL`
  )
}

interface StudentRow {
  id: string
  first_name: string
  preferred_name: string | null
  last_name: string
  group_code: string | null
  year_level: string | null
}

function activeStudents(db: LockerDb): StudentRow[] {
  return db.all<StudentRow>(
    `SELECT id, first_name, preferred_name, last_name, group_code, year_level FROM student
      WHERE archived_at IS NULL AND active = 1 AND left_at IS NULL`
  )
}

/** Students grouped by group, in the school's group order, sorted by surname. */
function byGroup<T extends { group_code: string | null; last_name: string; first_name: string }>(
  db: LockerDb,
  rows: T[],
  onlyGroup: string | null
): { code: string; heading: string; rows: T[] }[] {
  const { order, display } = groupOrder(db)
  const map = new Map<string, T[]>()
  for (const r of rows) {
    const code = r.group_code ?? '—'
    if (onlyGroup && code !== onlyGroup) continue
    const list = map.get(code) ?? []
    list.push(r)
    map.set(code, list)
  }
  return [...map.entries()]
    .sort(
      ([a], [b]) =>
        (order.get(a) ?? 9999) - (order.get(b) ?? 9999) ||
        a.localeCompare(b, 'en-AU', { numeric: true })
    )
    .map(([code, list]) => ({
      code,
      heading: display.get(code) ?? code,
      rows: list.sort(
        (x, y) =>
          x.last_name.localeCompare(y.last_name, 'en-AU', { sensitivity: 'base' }) ||
          x.first_name.localeCompare(y.first_name, 'en-AU', { sensitivity: 'base' })
      )
    }))
}

function base(
  req: ReportRequest,
  partial: Partial<BuiltReport> & Pick<BuiltReport, 'columns' | 'sections'>
): BuiltReport {
  const info = REPORTS[req.id]
  return {
    title: info.title,
    subtitle: null,
    note: null,
    sectionLabel: null,
    breakBetween: false,
    confidential: false,
    landscape: info.landscape,
    revealedLockers: [],
    ...partial,
    rows: partial.sections.reduce((n, s) => n + s.rows.length, 0)
  }
}

function lockRows(db: LockerDb): Map<
  string,
  {
    type: LockType
    code_status: CodeStatus
    code_cipher: Uint8Array | null
    key_number: string | null
    id: string
  }
> {
  const out = new Map<
    string,
    {
      type: LockType
      code_status: CodeStatus
      code_cipher: Uint8Array | null
      key_number: string | null
      id: string
    }
  >()
  for (const r of db.all<{
    id: string
    locker_id: string
    type: LockType
    code_status: CodeStatus
    code_cipher: Uint8Array | null
    key_number: string | null
  }>(
    "SELECT id, locker_id, type, code_status, code_cipher, key_number FROM lock WHERE locker_id IS NOT NULL AND status IN ('in_use','spare')"
  ))
    if (!out.has(r.locker_id)) out.set(r.locker_id, r)
  return out
}

function groupLists(db: LockerDb, req: ReportRequest, terms: Terminology): BuiltReport {
  const held = new Map(holders(db).map((h) => [h.student_id, h]))
  const groups = byGroup(db, activeStudents(db), req.group)
  return base(req, {
    sectionLabel: terms.group.one,
    breakBetween: true,
    columns: [
      { key: 'student', label: 'Student', width: 4 },
      { key: 'year', label: terms.yearLevel.one, width: 1.4 },
      { key: 'locker', label: terms.locker.one, width: 1.4 },
      { key: 'where', label: `${terms.area.one} · ${terms.bank.one}`, width: 3 }
    ],
    sections: groups.map((g) => ({
      heading: `${terms.group.one} ${g.heading}`,
      rows: g.rows.map((s) => {
        const h = held.get(s.id)
        return {
          student: name(s),
          year: s.year_level ?? '',
          locker: h?.number ?? '—',
          where: h ? `${h.area} · ${h.bank}` : 'No locker'
        }
      })
    }))
  })
}

function master(db: LockerDb, req: ReportRequest, terms: Terminology): BuiltReport {
  const { display } = groupOrder(db)
  const locks = lockRows(db)
  const key = readCodeKey(db)
  const revealed: string[] = []
  const rows = holders(db)
    .filter((h) => !req.group || h.group_code === req.group)
    .sort((a, b) => compareLockerNumbers(a.number, b.number))
    .map((h) => {
      const lock = locks.get(h.locker_id)
      const info = lock ? LOCK_TYPE_INFO[lock.type] : null
      let code = ''
      if (lock && info?.hasCode) {
        const c = lock.code_cipher ? decryptCode(key, lock.code_cipher) : null
        if (c) {
          code = c
          revealed.push(h.locker_id)
        }
      } else if (lock && info?.keyed) code = lock.key_number ? `Key ${lock.key_number}` : ''
      return {
        locker: h.number,
        student: name(h),
        group: h.group_code ? (display.get(h.group_code) ?? h.group_code) : '',
        code,
        status: lock ? statusWords(lock.code_status) : 'No lock'
      }
    })
  return base(req, {
    subtitle: req.group ? `${terms.group.one} ${display.get(req.group) ?? req.group}` : null,
    confidential: true,
    revealedLockers: revealed,
    columns: [
      { key: 'locker', label: terms.locker.one, width: 1.2 },
      { key: 'student', label: 'Student', width: 3.6 },
      { key: 'group', label: terms.group.one, width: 1.4 },
      { key: 'code', label: 'Code', width: 1.8, kind: 'code' },
      { key: 'status', label: 'Lock', width: 3 }
    ],
    sections: [{ heading: null, rows }]
  })
}

function statusWords(s: CodeStatus): string {
  switch (s) {
    case 'set':
      return 'Code issued'
    case 'reset_no_code':
      return 'On 0 0 0 0, no code yet'
    case 'needs_new_code':
      return 'Needs a new code'
    case 'awaiting_physical_reset':
      return 'Waiting for a reset'
    case 'not_applicable':
      return ''
  }
}

function byBank(db: LockerDb, req: ReportRequest, terms: Terminology): BuiltReport {
  const { display } = groupOrder(db)
  const held = new Map<string, Holder[]>()
  for (const h of holders(db)) held.set(h.locker_id, [...(held.get(h.locker_id) ?? []), h])
  const locks = lockRows(db)
  const lockers = db.all<{
    id: string
    number: string
    status: string
    accessible: number
    out_of_service_reason: string | null
    area: string
    bank: string
    area_sort: number
    bank_sort: number
  }>(
    `SELECT l.id, l.number, l.status, l.accessible, l.out_of_service_reason, a.name AS area, b.name AS bank,
            a.sort_order AS area_sort, b.sort_order AS bank_sort
       FROM locker l JOIN bank b ON b.id = l.bank_id JOIN area a ON a.id = b.area_id
      WHERE l.archived_at IS NULL AND b.archived_at IS NULL AND a.archived_at IS NULL
      ORDER BY a.sort_order, a.name, b.sort_order, b.name`
  )
  const sections = new Map<string, ReportSection>()
  for (const l of lockers) {
    const heading = `${l.area} · ${l.bank}`
    const sec = sections.get(heading) ?? { heading, rows: [] }
    const hs = held.get(l.id) ?? []
    const lock = locks.get(l.id)
    const state =
      l.status === 'out_of_service'
        ? `Out of service${l.out_of_service_reason ? `: ${l.out_of_service_reason}` : ''}`
        : l.status === 'reserved'
          ? 'Reserved'
          : hs.length > 0
            ? 'In use'
            : 'Spare'
    sec.rows.push({
      locker: l.number,
      status: `${state}${l.accessible ? ' · accessible' : ''}`,
      student: hs.map(name).join('; '),
      group: hs
        .map((h) => (h.group_code ? (display.get(h.group_code) ?? h.group_code) : ''))
        .join('; '),
      lock: lock ? LOCK_TYPE_INFO[lock.type].name : 'No lock'
    })
    sections.set(heading, sec)
  }
  for (const s of sections.values())
    s.rows.sort((a, b) => compareLockerNumbers(a.locker!, b.locker!))
  return base(req, {
    sectionLabel: `${terms.area.one} · ${terms.bank.one}`,
    columns: [
      { key: 'locker', label: terms.locker.one, width: 1.2 },
      { key: 'status', label: 'Status', width: 2.6 },
      { key: 'student', label: 'Student', width: 3.4 },
      { key: 'group', label: terms.group.one, width: 1.4 },
      { key: 'lock', label: 'Lock', width: 2.6 }
    ],
    sections: [...sections.values()]
  })
}

function resetChecklist(db: LockerDb, req: ReportRequest, terms: Terminology): BuiltReport {
  const key = req.includeCodes ? readCodeKey(db) : null
  const revealed: string[] = []
  const rows = db
    .all<{
      locker_id: string | null
      number: string | null
      area: string | null
      bank: string | null
      code_status: CodeStatus
      code_cipher: Uint8Array | null
      holder: string | null
    }>(
      `SELECT l.id AS locker_id, l.number, a.name AS area, b.name AS bank, k.code_status, k.code_cipher,
              (SELECT s.last_name || ', ' || COALESCE(s.preferred_name, s.first_name) FROM assignment x JOIN student s ON s.id = x.student_id
                WHERE x.locker_id = l.id AND x.status = 'current' LIMIT 1) AS holder
         FROM lock k LEFT JOIN locker l ON l.id = k.locker_id
         LEFT JOIN bank b ON b.id = l.bank_id LEFT JOIN area a ON a.id = b.area_id
        WHERE k.code_status IN ('needs_new_code', 'awaiting_physical_reset') AND k.status IN ('in_use','spare')`
    )
    .sort((a, b) => compareLockerNumbers(a.number ?? '', b.number ?? ''))
    .map((r) => {
      let code = ''
      if (r.code_status === 'awaiting_physical_reset' && key && r.code_cipher) {
        code = decryptCode(key, r.code_cipher) ?? ''
        if (code && r.locker_id) revealed.push(r.locker_id)
      }
      return {
        done: '',
        locker: r.number ?? '—',
        where: r.area ? `${r.area} · ${r.bank ?? ''}` : '',
        holder: r.holder ?? 'Spare',
        todo:
          r.code_status === 'needs_new_code' ? 'Reset to 0 0 0 0' : 'Set the lock to its new code',
        code
      }
    })
  const columns: BuiltReport['columns'] = [
    { key: 'done', label: 'Done', width: 0.8, kind: 'tick' },
    { key: 'locker', label: terms.locker.one, width: 1.2 },
    { key: 'where', label: `${terms.area.one} · ${terms.bank.one}`, width: 2.6 },
    { key: 'holder', label: 'Student', width: 3 },
    { key: 'todo', label: 'What to do', width: 3 }
  ]
  if (req.includeCodes) columns.push({ key: 'code', label: 'New code', width: 1.6, kind: 'code' })
  return base(req, {
    note: 'Reset each lock with the master key, tick it here, then click “Reset done” for it in Locker Manager.',
    confidential: req.includeCodes && revealed.length > 0,
    revealedLockers: revealed,
    columns,
    sections: [{ heading: null, rows }]
  })
}

function perGroupSheet(
  db: LockerDb,
  req: ReportRequest,
  terms: Terminology,
  kind: 'self_reset' | 'sign_off'
): BuiltReport {
  const locks = lockRows(db)
  const list = holders(db).filter((h) => {
    if (kind === 'sign_off') return true
    const lock = locks.get(h.locker_id)
    return lock ? LOCK_TYPE_INFO[lock.type].codeSettable : false
  })
  const groups = byGroup(db, list, req.group)
  const sections = groups.map((g) => ({
    heading: `${terms.group.one} ${g.heading}`,
    rows: g.rows.map((h) =>
      kind === 'sign_off'
        ? { student: name(h), locker: h.number, signature: '', date: '' }
        : { tick: '', student: name(h), locker: h.number, checked: '' }
    )
  }))
  return base(req, {
    sectionLabel: terms.group.one,
    breakBetween: true,
    note:
      kind === 'sign_off'
        ? 'By signing, each student agrees they received their locker letter and will keep their code to themselves.'
        : 'On the last day, ask each student to empty their locker and turn every dial to 0 0 0 0, then close it. Check each lock opens on 0 0 0 0 and tick it. Students do this in a few minutes; resetting every lock with the master key takes a full day.',
    columns:
      kind === 'sign_off'
        ? [
            { key: 'student', label: 'Student', width: 3.4 },
            { key: 'locker', label: terms.locker.one, width: 1.2 },
            { key: 'signature', label: 'Signature', width: 4, kind: 'blank' },
            { key: 'date', label: 'Date', width: 1.6, kind: 'blank' }
          ]
        : [
            { key: 'tick', label: 'On 0 0 0 0', width: 1.2, kind: 'tick' },
            { key: 'student', label: 'Student', width: 3.6 },
            { key: 'locker', label: terms.locker.one, width: 1.2 },
            { key: 'checked', label: 'Checked by', width: 2.4, kind: 'blank' }
          ],
    sections
  })
}

function keyRegister(db: LockerDb, req: ReportRequest, terms: Terminology): BuiltReport {
  const held = new Map(holders(db).map((h) => [h.locker_id, h]))
  const events = db.all<{
    lock_id: string
    event: string
    event_date: string
    sname: string | null
  }>(
    `SELECT e.lock_id, e.event, e.event_date,
            s.last_name || ', ' || COALESCE(s.preferred_name, s.first_name) AS sname
       FROM key_event e LEFT JOIN student s ON s.id = e.student_id
      ORDER BY e.event_date, e.created_at`
  )
  const last = new Map<string, (typeof events)[number]>()
  const out = new Map<string, number>()
  for (const e of events) {
    last.set(e.lock_id, e)
    const n = out.get(e.lock_id) ?? 0
    out.set(
      e.lock_id,
      e.event === 'issued' ? n + 1 : e.event === 'returned' ? Math.max(0, n - 1) : n
    )
  }
  const rows = db
    .all<{
      id: string
      type: LockType
      key_number: string | null
      locker_id: string | null
      number: string | null
    }>(
      `SELECT k.id, k.type, k.key_number, k.locker_id, l.number FROM lock k LEFT JOIN locker l ON l.id = k.locker_id
        WHERE k.type IN ('keyed_padlock', 'keyed_builtin') AND k.status IN ('in_use','spare','lost')`
    )
    .sort((a, b) => compareLockerNumbers(a.number ?? '', b.number ?? ''))
    .map((k) => {
      const h = k.locker_id ? held.get(k.locker_id) : undefined
      const e = last.get(k.id)
      return {
        locker: k.number ?? '—',
        key: k.key_number ?? '',
        lock: LOCK_TYPE_INFO[k.type].name,
        holder: h ? name(h) : 'Spare',
        out: String(out.get(k.id) ?? 0),
        last: e ? `${e.event} ${e.event_date.slice(0, 10)}${e.sname ? ` (${e.sname})` : ''}` : ''
      }
    })
  return base(req, {
    columns: [
      { key: 'locker', label: terms.locker.one, width: 1.2 },
      { key: 'key', label: 'Key number', width: 1.6 },
      { key: 'lock', label: 'Lock', width: 2.4 },
      { key: 'holder', label: 'Student', width: 3 },
      { key: 'out', label: 'Keys out', width: 1.1 },
      { key: 'last', label: 'Last key event', width: 3.4 }
    ],
    sections: [{ heading: null, rows }]
  })
}

function changes(db: LockerDb, req: ReportRequest, terms: Terminology): BuiltReport {
  const since = req.since ?? new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)
  const rows = db
    .all<{
      at: string
      operator: string
      machine: string
      action: string
      reason: string | null
      sname: string | null
      lnum: string | null
    }>(
      `SELECT h.at, h.operator, h.machine, h.action, h.reason,
              COALESCE(s.preferred_name, s.first_name) || ' ' || s.last_name AS sname, l.number AS lnum
         FROM audit_log h
         LEFT JOIN student s ON h.entity = 'student' AND s.id = h.entity_id
         LEFT JOIN locker l ON h.entity = 'locker' AND l.id = h.entity_id
        WHERE h.at >= $since ORDER BY h.at, h.rowid`,
      { $since: `${since}T00:00:00` }
    )
    .map((r) => ({
      when: new Date(r.at).toLocaleString('en-AU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      }),
      who: r.operator,
      machine: r.machine,
      what: describeAction(r.action),
      detail: [r.sname ?? (r.lnum ? `${terms.locker.one} ${r.lnum}` : null), r.reason]
        .filter(Boolean)
        .join(' · ')
    }))
  const d = new Date(`${since}T00:00:00`)
  return base(req, {
    subtitle: `Since ${d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`,
    columns: [
      { key: 'when', label: 'When', width: 2.2 },
      { key: 'who', label: 'Who', width: 1.8 },
      { key: 'machine', label: 'Computer', width: 1.6 },
      { key: 'what', label: 'What', width: 3 },
      { key: 'detail', label: 'Details', width: 3.2 }
    ],
    sections: [{ heading: null, rows }]
  })
}

/** Builds a report from the open file. */
export function buildReport(db: LockerDb, req: ReportRequest): BuiltReport {
  const terms = getTerms(db)
  switch (req.id) {
    case 'group_lists':
      return groupLists(db, req, terms)
    case 'master':
      return master(db, { ...req, includeCodes: true }, terms)
    case 'by_bank':
      return byBank(db, req, terms)
    case 'reset_checklist':
      return resetChecklist(db, req, terms)
    case 'self_reset':
      return perGroupSheet(db, req, terms, 'self_reset')
    case 'sign_off':
      return perGroupSheet(db, req, terms, 'sign_off')
    case 'key_register':
      return keyRegister(db, req, terms)
    case 'changes':
      return changes(db, req, terms)
  }
}

/** The same report with every code replaced by dots, for the screen. */
export function maskCodes(report: ReportData): ReportData {
  const codeKeys = report.columns.filter((c) => c.kind === 'code').map((c) => c.key)
  if (codeKeys.length === 0) return report
  return {
    ...report,
    sections: report.sections.map((s) => ({
      ...s,
      rows: s.rows.map((r) => {
        const copy = { ...r }
        for (const k of codeKeys)
          if (copy[k] && !copy[k]!.startsWith('Key ')) copy[k] = copy[k]!.replace(/[0-9]/g, '•')
        return copy
      })
    }))
  }
}
