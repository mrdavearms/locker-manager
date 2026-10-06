import type { Problem } from '@shared/problems'
import type { LockerDb } from '../db/db'
import { decryptCode, readCodeKey } from '../codes/cipher'
import { codeRules } from './codes'
import { letterSet } from './letters'
import { studentCounts } from './students'

// Everything that needs attention (SPEC.md 10), worked out from the file each time.
// Lock codes are compared in memory and never leave this function.

function count(db: LockerDb, sql: string): number {
  return Number(db.get<{ n: number }>(sql)?.n ?? 0)
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

export function listProblems(db: LockerDb): Problem[] {
  const out: Problem[] = []
  const counts = studentCounts(db)
  const rules = codeRules(db)

  // Two locks with the same code, where codes should be unique.
  if (rules.uniqueness !== 'none') {
    const key = readCodeKey(db)
    const seen = new Map<string, number>()
    for (const r of db.all<{ code_cipher: Uint8Array; area_id: string | null }>(
      `SELECT k.code_cipher, b.area_id FROM lock k LEFT JOIN locker l ON l.id = k.locker_id
         LEFT JOIN bank b ON b.id = l.bank_id
        WHERE k.code_cipher IS NOT NULL AND k.status IN ('in_use','spare')`
    )) {
      const c = decryptCode(key, r.code_cipher)
      if (!c) continue
      const k = rules.uniqueness === 'area' ? `${r.area_id ?? ''}|${c}` : c
      seen.set(k, (seen.get(k) ?? 0) + 1)
    }
    const dupes = [...seen.values()].filter((n) => n > 1).reduce((a, n) => a + n, 0)
    if (dupes > 0)
      out.push({
        id: 'duplicate-codes',
        tone: 'bad',
        title: `${plural(dupes, 'lock')} share a code`,
        detail: 'Codes should be unique. Give one of each pair a new code from its locker.',
        fix: { label: 'Open Lockers', screen: 'lockers' }
      })
  }

  const unplaced = count(
    db,
    `SELECT COUNT(*) AS n FROM student s WHERE s.archived_at IS NULL AND s.active = 1
       AND NOT EXISTS (SELECT 1 FROM assignment a WHERE a.student_id = s.id AND a.status = 'current')
       AND NOT EXISTS (SELECT 1 FROM exclusion e WHERE (e.kind = 'student' AND e.value = s.external_id)
                        OR (e.kind = 'group' AND e.value = s.group_code)
                        OR (e.kind = 'year_level' AND e.value = s.year_level))`
  )
  const assigned = count(db, "SELECT COUNT(*) AS n FROM assignment WHERE status = 'current'")
  if (unplaced > 0)
    out.push({
      id: 'no-locker',
      tone: 'warn',
      title: `${plural(unplaced, 'student')} without a locker`,
      detail:
        assigned === 0
          ? 'No lockers have been given out yet.'
          : 'Give them a locker, or exclude them if they never get one.',
      fix:
        assigned === 0
          ? { label: 'Allocate', screen: 'allocate' }
          : { label: 'See students', screen: 'students' }
    })

  if (counts.possibleLeavers > 0)
    out.push({
      id: 'possible-leavers',
      tone: 'warn',
      title: `${plural(counts.possibleLeavers, 'possible leaver')}`,
      detail: 'Not in the latest import. Confirm they have left, or that they are still here.',
      fix: { label: 'See students', screen: 'students' }
    })

  if (counts.nameCheck > 0)
    out.push({
      id: 'name-check',
      tone: 'warn',
      title: `${plural(counts.nameCheck, 'name')} to check`,
      detail: 'Surnames such as MacDonald or De La Rue need a person to check the capitals.',
      fix: { label: 'See students', screen: 'students' }
    })

  const resets = count(
    db,
    "SELECT COUNT(*) AS n FROM lock WHERE code_status IN ('needs_new_code','awaiting_physical_reset') AND status IN ('in_use','spare')"
  )
  if (resets > 0)
    out.push({
      id: 'resets',
      tone: 'warn',
      title: `${plural(resets, 'lock')} waiting for a reset`,
      detail: 'Listed under Locks to reset below. Their letters are held back until then.',
      fix: null
    })

  const spares = count(
    db,
    "SELECT COUNT(*) AS n FROM code_set_entry e JOIN code_set s ON s.id = e.code_set_id WHERE s.purpose = 'spares' AND e.status = 'available'"
  )
  const anySet = count(db, 'SELECT COUNT(*) AS n FROM code_set')
  const lowAt = Math.max(5, Math.round(rules.sparePoolSize / 10))
  if (anySet > 0 && spares < lowAt)
    out.push({
      id: 'low-spares',
      tone: 'warn',
      title: spares === 0 ? 'No spare codes left' : `Only ${plural(spares, 'spare code')} left`,
      detail: 'New codes are still made when needed. Make a new code set to refill the spares.',
      fix: { label: 'Lock code settings', screen: 'settings' }
    })

  const lastLetters = db.get<{ at: string | null }>(
    "SELECT MAX(printed_at) AS at FROM print_job WHERE kind = 'letters'"
  )?.at
  if (lastLetters) {
    const waiting = letterSet(db, { mode: 'changed' }, true).records.length
    if (waiting > 0)
      out.push({
        id: 'letters',
        tone: 'warn',
        title: `${plural(waiting, 'letter')} to print`,
        detail: 'New lockers or codes since the last letters were printed.',
        fix: { label: 'Print letters', screen: 'letters' }
      })
  }
  return out
}
