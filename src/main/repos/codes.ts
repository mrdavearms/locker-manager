import {
  CodeRulesSchema,
  DEFAULT_CODE_RULES,
  type CodeRules,
  type CodeSetView,
  type CodeStatus,
  type ResetTask
} from '@shared/codes'
import { LOCK_TYPE_INFO, type LockType } from '@shared/locks'
import type { LockerDb } from '../db/db'
import { newId, stamp, type OperatorContext } from '../db/context'
import { codeKey, decryptCode, encryptCode } from '../codes/cipher'
import { generateCodes } from '../codes/generate'
import { secureSource, seededSource, type IntSource } from '../codes/random'
import { countValidCodes, formatCode, codeAt, isValidCode, parseCode } from '../codes/rules'
import { getSetting, setSetting } from './settings'

// Lock codes in the data file (SPEC.md 4.5 to 4.6). Codes are stored encrypted;
// they are decrypted only to check uniqueness, to print, or when an operator asks
// to see one (which is logged).

export function codeRules(db: LockerDb): CodeRules {
  return getSetting(db, 'codes.rules', CodeRulesSchema, DEFAULT_CODE_RULES)
}

export function setCodeRules(db: LockerDb, ctx: OperatorContext, rules: CodeRules): void {
  setSetting(db, ctx, 'codes.rules', rules)
}

export function rulesSummary(
  rules: CodeRules,
  source: IntSource = secureSource
): { validCount: number; estimated: boolean; samples: string[] } {
  const { count, estimated } = countValidCodes(rules)
  let samples: string[]
  try {
    samples = generateCodes(Math.min(10, count), rules, source, { taken: new Set() })
  } catch {
    samples = []
  }
  return { validCount: count, estimated, samples }
}

export function activeYearId(db: LockerDb): string | null {
  return (
    db.get<{ id: string }>("SELECT id FROM school_year WHERE status = 'active' LIMIT 1")?.id ?? null
  )
}

interface LockRow {
  id: string
  type: LockType
  locker_id: string | null
  code_cipher: Uint8Array | null
  code_status: CodeStatus
  dials: number | null
  positions_per_dial: number | null
}

function lockRow(db: LockerDb, lockId: string): LockRow {
  const r = db.get<LockRow>(
    'SELECT id, type, locker_id, code_cipher, code_status, dials, positions_per_dial FROM lock WHERE id = $id',
    { $id: lockId }
  )
  if (!r) throw new Error('That lock is no longer in the file.')
  return r
}

export function lockForLocker(db: LockerDb, lockerId: string): LockRow | null {
  return (
    db.get<LockRow>(
      "SELECT id, type, locker_id, code_cipher, code_status, dials, positions_per_dial FROM lock WHERE locker_id = $l AND status IN ('in_use','spare') LIMIT 1",
      { $l: lockerId }
    ) ?? null
  )
}

/** Rules for this lock: the school's rules with the lock's own length and range. */
function rulesFor(db: LockerDb, lock: LockRow): CodeRules {
  const r = codeRules(db)
  return { ...r, length: lock.dials ?? r.length, positions: lock.positions_per_dial ?? r.positions }
}

/** Every code currently on a lock or held ready in a code set, for uniqueness. */
export function takenCodes(
  db: LockerDb,
  scope: CodeRules['uniqueness'],
  areaId?: string | null
): Set<string> {
  if (scope === 'none') return new Set()
  const key = codeKey(db)
  const out = new Set<string>()
  const lockRows = db.all<{ code_cipher: Uint8Array | null; area_id: string | null }>(
    `SELECT k.code_cipher, b.area_id FROM lock k
       LEFT JOIN locker l ON l.id = k.locker_id LEFT JOIN bank b ON b.id = l.bank_id
      WHERE k.code_cipher IS NOT NULL AND k.status IN ('in_use','spare')`
  )
  for (const r of lockRows) {
    if (scope === 'area' && areaId && r.area_id !== areaId) continue
    const c = decryptCode(key, r.code_cipher)
    if (c) out.add(c)
  }
  for (const r of db.all<{ code_cipher: Uint8Array }>(
    "SELECT code_cipher FROM code_set_entry WHERE status IN ('available','assigned')"
  )) {
    const c = decryptCode(key, r.code_cipher)
    if (c) out.add(c)
  }
  return out
}

/** Codes this lock must not get again (its own history within the rule's years). */
export function previousCodes(db: LockerDb, lockId: string, years: number, now: Date): Set<string> {
  const key = codeKey(db)
  const since = new Date(now)
  since.setFullYear(since.getFullYear() - Math.max(1, years))
  const rows = db.all<{ code_cipher: Uint8Array | null; from_date: string }>(
    'SELECT code_cipher, from_date FROM code_history WHERE lock_id = $id ORDER BY from_date DESC',
    { $id: lockId }
  )
  const out = new Set<string>()
  rows.forEach((r, i) => {
    if (i === 0 || r.from_date >= since.toISOString()) {
      const c = decryptCode(key, r.code_cipher)
      if (c) out.add(c)
    }
  })
  const current = decryptCode(key, lockRow(db, lockId).code_cipher)
  if (current) out.add(current)
  return out
}

function areaOfLock(db: LockerDb, lockId: string): string | null {
  return (
    db.get<{ area_id: string }>(
      'SELECT b.area_id FROM lock k JOIN locker l ON l.id = k.locker_id JOIN bank b ON b.id = l.bank_id WHERE k.id = $id',
      { $id: lockId }
    )?.area_id ?? null
  )
}

/** A ready code for this lock: its locker's entry in this year's set, else a spare, else a new one. */
function nextCodeFor(
  db: LockerDb,
  ctx: OperatorContext,
  lock: LockRow,
  source: IntSource
): { code: string; entryId: string | null } {
  const key = codeKey(db)
  const rules = rulesFor(db, lock)
  const avoid = rules.banPrevious
    ? previousCodes(db, lock.id, rules.historyYears, ctx.now())
    : new Set<string>()
  const fits = (c: string | null): c is string => {
    if (!c) return false
    const parsed = parseCode(c, rules)
    return parsed !== null && !avoid.has(c) && isValidCode(parsed, rules, avoid)
  }
  const year = activeYearId(db)
  if (lock.locker_id && year) {
    const e = db.get<{ id: string; code_cipher: Uint8Array }>(
      `SELECT e.id, e.code_cipher FROM code_set_entry e JOIN code_set s ON s.id = e.code_set_id
        WHERE s.purpose = 'year' AND s.school_year_id = $y AND e.locker_id = $l AND e.status = 'available'
          AND s.id NOT IN (SELECT value FROM json_each(COALESCE((SELECT value FROM settings WHERE key = 'codes.reservedForNextYear'), '[]')))
        LIMIT 1`,
      { $y: year, $l: lock.locker_id }
    )
    const c = e ? decryptCode(key, e.code_cipher) : null
    if (e && fits(c)) return { code: c, entryId: e.id }
  }
  const spares = db.all<{ id: string; code_cipher: Uint8Array; code_length: number }>(
    "SELECT e.id, e.code_cipher, e.code_length FROM code_set_entry e JOIN code_set s ON s.id = e.code_set_id WHERE s.purpose = 'spares' AND e.status = 'available' ORDER BY e.rowid LIMIT 200"
  )
  for (const sp of spares) {
    const c = decryptCode(key, sp.code_cipher)
    if (fits(c)) return { code: c, entryId: sp.id }
  }
  const [code] = generateCodes(1, rules, source, {
    taken: takenCodes(db, rules.uniqueness, areaOfLock(db, lock.id)),
    avoidPerSlot: [avoid]
  })
  return { code: code!, entryId: null }
}

function writeCode(
  db: LockerDb,
  ctx: OperatorContext,
  lock: LockRow,
  code: string,
  status: CodeStatus,
  reason: string,
  entryId: string | null
): void {
  const key = codeKey(db)
  const s = stamp(ctx)
  const cipher = encryptCode(key, code)
  db.run('UPDATE code_history SET to_date = $now WHERE lock_id = $id AND to_date IS NULL', {
    $id: lock.id,
    $now: s.created_at
  })
  db.run(
    `INSERT INTO code_history (id, lock_id, code_cipher, from_date, reason, changed_by, created_at, updated_at, updated_by)
     VALUES ($id, $lock, $c, $now, $reason, $by, $now, $now, $by)`,
    {
      $id: newId(),
      $lock: lock.id,
      $c: encryptCode(key, code),
      $now: s.created_at,
      $reason: reason,
      $by: s.updated_by
    }
  )
  db.run(
    'UPDATE lock SET code_cipher = $c, code_status = $st, updated_at = $now, updated_by = $by WHERE id = $id',
    {
      $id: lock.id,
      $c: cipher,
      $st: status,
      $now: s.created_at,
      $by: s.updated_by
    }
  )
  if (entryId) {
    db.run(
      "UPDATE code_set_entry SET status = 'used', lock_id = $lock, assigned_at = $now, assigned_by = $by WHERE id = $id",
      {
        $id: entryId,
        $lock: lock.id,
        $now: s.created_at,
        $by: s.updated_by
      }
    )
  }
}

/**
 * Gives a lock a code for its next holder (SPEC.md 4.5). A lock on 0 0 0 0 gets a
 * code the student sets themselves; a lock someone else still knows gets a new
 * code and goes on the "waiting for a physical reset" list.
 */
export function issueCode(
  db: LockerDb,
  ctx: OperatorContext,
  lockId: string,
  reason: 'issued' | 'compromised' | 'year_rollover',
  source: IntSource = secureSource
): string | null {
  const lock = lockRow(db, lockId)
  const info = LOCK_TYPE_INFO[lock.type]
  if (!info.hasCode) return null
  if (!info.codeSettable) {
    // A fixed-code padlock: its code comes with it. "Recode" means a different padlock.
    if (reason === 'compromised')
      throw new Error('This padlock’s code cannot change. Swap the padlock and record the new one.')
    return decryptCode(codeKey(db), lock.code_cipher)
  }
  // A code that is set and known only to nobody yet (a spare with a ready code) is kept.
  if (lock.code_status === 'set' && reason === 'issued') {
    const existing = decryptCode(codeKey(db), lock.code_cipher)
    if (existing) return existing
  }
  const { code, entryId } = nextCodeFor(db, ctx, lock, source)
  const status: CodeStatus =
    lock.code_status === 'reset_no_code' ? 'set' : 'awaiting_physical_reset'
  writeCode(
    db,
    ctx,
    lock,
    code,
    status,
    reason === 'issued' && lock.code_status !== 'reset_no_code' ? 'reset' : reason,
    entryId
  )
  return code
}

/** The lock's holder has changed, so the old code is known by someone else. */
export function markNeedsNewCode(db: LockerDb, ctx: OperatorContext, lockId: string): void {
  const lock = lockRow(db, lockId)
  if (!LOCK_TYPE_INFO[lock.type].hasCode || !LOCK_TYPE_INFO[lock.type].codeSettable) return
  if (lock.code_status === 'set' || lock.code_status === 'awaiting_physical_reset') {
    db.run(
      "UPDATE lock SET code_status = 'needs_new_code', updated_at = $at, updated_by = $by WHERE id = $id",
      { $id: lockId, $at: ctx.now().toISOString(), $by: ctx.operator }
    )
  }
}

/** "Reset done" for every ticked lock, in one change and one history line. */
export function markResetDoneMany(db: LockerDb, ctx: OperatorContext, lockIds: string[]): number {
  for (const id of lockIds) markResetDone(db, ctx, id)
  return lockIds.length
}

/** An operator ticks that the physical lock has been reset (SPEC.md 4.5). */
export function markResetDone(db: LockerDb, ctx: OperatorContext, lockId: string): CodeStatus {
  const lock = lockRow(db, lockId)
  const next: CodeStatus =
    lock.code_status === 'awaiting_physical_reset'
      ? 'set'
      : lock.code_status === 'needs_new_code'
        ? 'reset_no_code'
        : lock.code_status
  if (next === 'reset_no_code') {
    db.run('UPDATE code_history SET to_date = $now WHERE lock_id = $id AND to_date IS NULL', {
      $id: lockId,
      $now: ctx.now().toISOString()
    })
    db.run('UPDATE lock SET code_cipher = NULL WHERE id = $id', { $id: lockId })
  }
  db.run('UPDATE lock SET code_status = $st, updated_at = $at, updated_by = $by WHERE id = $id', {
    $id: lockId,
    $st: next,
    $at: ctx.now().toISOString(),
    $by: ctx.operator
  })
  return next
}

/** Shows a code to an operator, and logs that it was shown (SPEC.md 2.8). */
export function revealCode(
  db: LockerDb,
  ctx: OperatorContext,
  lockerId: string,
  where: 'screen' | 'letter' | 'export' | 'report'
): string | null {
  const lock = lockForLocker(db, lockerId)
  if (!lock) return null
  const code = decryptCode(codeKey(db), lock.code_cipher)
  const holder = db.get<{ student_id: string }>(
    "SELECT student_id FROM assignment WHERE locker_id = $l AND status = 'current' LIMIT 1",
    { $l: lockerId }
  )
  const s = stamp(ctx)
  db.run(
    `INSERT INTO code_reveal_log (id, at, operator, machine, student_id, locker_id, revealed_in, created_at, updated_at, updated_by)
     VALUES ($id, $at, $op, $m, $st, $l, $w, $at, $at, $op)`,
    {
      $id: newId(),
      $at: s.created_at,
      $op: ctx.operator,
      $m: ctx.machine,
      $st: holder?.student_id ?? null,
      $l: lockerId,
      $w: where
    }
  )
  return code
}

export function resetTasks(db: LockerDb): ResetTask[] {
  return db
    .all<{
      id: string
      locker_id: string | null
      number: string | null
      code_status: CodeStatus
      holder: string | null
      updated_at: string
    }>(
      `SELECT k.id, k.locker_id, l.number, k.code_status, k.updated_at,
              (SELECT COALESCE(s.preferred_name, s.first_name) || ' ' || s.last_name FROM assignment a JOIN student s ON s.id = a.student_id
                WHERE a.locker_id = l.id AND a.status = 'current' LIMIT 1) AS holder
         FROM lock k LEFT JOIN locker l ON l.id = k.locker_id
        WHERE k.code_status IN ('needs_new_code', 'awaiting_physical_reset') AND k.status IN ('in_use','spare')
        ORDER BY l.sort_key`
    )
    .map((r) => ({
      lockId: r.id,
      lockerId: r.locker_id,
      lockerNumber: r.number,
      status: r.code_status,
      holder: r.holder,
      since: r.updated_at
    }))
}

/**
 * Next year's code set (SPEC.md 4.6): one code per locker, never the locker's
 * code from before, plus a pool of spares. Deterministic when a seed is given.
 */
export function generateYearSet(
  db: LockerDb,
  ctx: OperatorContext,
  input: { name: string; schoolYearId: string | null; seed: string | null }
): { set: string; codes: number; spares: number; validCount: number; overHalf: boolean } {
  const rules = codeRules(db)
  const lockers = db.all<{
    locker_id: string
    lock_id: string
    dials: number | null
    positions: number | null
  }>(
    `SELECT l.id AS locker_id, k.id AS lock_id, k.dials, k.positions_per_dial AS positions FROM locker l
       JOIN lock k ON k.locker_id = l.id AND k.status IN ('in_use','spare')
      WHERE l.archived_at IS NULL AND k.type IN ('combination_builtin', 'combination_padlock_settable', 'electronic')
      ORDER BY l.sort_key`
  )
  const odd = lockers.find(
    (l) =>
      (l.dials ?? rules.length) !== rules.length ||
      (l.positions ?? rules.positions) !== rules.positions
  )
  if (odd)
    throw new Error(
      'Some locks have a different number of dials from the code rules. Make the code rules match the locks first.'
    )
  const source = input.seed ? seededSource(input.seed) : secureSource
  const avoid = lockers.map((l) => previousCodes(db, l.lock_id, rules.historyYears, ctx.now()))
  const taken = takenCodes(db, rules.uniqueness)
  // This year's codes on the locks do not block next year's set; only other sets do.
  for (const a of avoid) for (const c of a) taken.delete(c)
  const { count } = countValidCodes(rules)
  const total = lockers.length + rules.sparePoolSize
  const codes = generateCodes(total, rules, source, { taken, avoidPerSlot: avoid })
  const key = codeKey(db)
  const s = stamp(ctx)
  const insertSet = (purpose: 'year' | 'spares', name: string): string => {
    const id = newId()
    db.run(
      `INSERT INTO code_set (id, name, school_year_id, purpose, rules, seed, created_at, updated_at, updated_by)
       VALUES ($id, $name, $y, $p, $r, $seed, $c, $c, $by)`,
      {
        $id: id,
        $name: name,
        $y: input.schoolYearId,
        $p: purpose,
        $r: JSON.stringify(rules),
        $seed: input.seed,
        $c: s.created_at,
        $by: s.updated_by
      }
    )
    return id
  }
  const yearSet = insertSet('year', input.name)
  lockers.forEach((l, i) => {
    db.run(
      `INSERT INTO code_set_entry (id, code_set_id, code_cipher, code_length, status, locker_id, created_at, updated_at, updated_by)
       VALUES ($id, $set, $c, $len, 'available', $l, $now, $now, $by)`,
      {
        $id: newId(),
        $set: yearSet,
        $c: encryptCode(key, codes[i]!),
        $len: rules.length,
        $l: l.locker_id,
        $now: s.created_at,
        $by: s.updated_by
      }
    )
  })
  if (rules.sparePoolSize > 0) {
    const spareSet = insertSet('spares', `${input.name} (spares)`)
    for (const c of codes.slice(lockers.length)) {
      db.run(
        `INSERT INTO code_set_entry (id, code_set_id, code_cipher, code_length, status, created_at, updated_at, updated_by)
         VALUES ($id, $set, $c, $len, 'available', $now, $now, $by)`,
        {
          $id: newId(),
          $set: spareSet,
          $c: encryptCode(key, c),
          $len: rules.length,
          $now: s.created_at,
          $by: s.updated_by
        }
      )
    }
  }
  return {
    set: yearSet,
    codes: lockers.length,
    spares: rules.sparePoolSize,
    validCount: count,
    overHalf: total > count / 2
  }
}

export function listCodeSets(db: LockerDb): CodeSetView[] {
  const reserved = new Set(reservedSetIds(db))
  return db
    .all<{
      id: string
      name: string
      purpose: 'year' | 'spares'
      label: string | null
      total: number
      available: number
      created_at: string
    }>(
      `SELECT s.id, s.name, s.purpose, y.label, s.created_at,
              (SELECT COUNT(*) FROM code_set_entry e WHERE e.code_set_id = s.id) AS total,
              (SELECT COUNT(*) FROM code_set_entry e WHERE e.code_set_id = s.id AND e.status = 'available') AS available
         FROM code_set s LEFT JOIN school_year y ON y.id = s.school_year_id ORDER BY s.created_at DESC`
    )
    .map((r) => ({
      id: r.id,
      name: r.name,
      purpose: r.purpose,
      forNextYear: reserved.has(r.id),
      schoolYear: r.label,
      total: Number(r.total),
      available: Number(r.available),
      createdAt: r.created_at
    }))
}

/** A plain text code typed by an operator for a fixed padlock's factory code. */
export function setFixedCode(
  db: LockerDb,
  ctx: OperatorContext,
  lockId: string,
  text: string,
  serial: string | null
): void {
  const lock = lockRow(db, lockId)
  const rules = rulesFor(db, lock)
  const parsed = parseCode(text, rules)
  if (!parsed)
    throw new Error(
      `A code for this lock is ${rules.length} numbers from 0 to ${rules.positions - 1}.`
    )
  writeCode(db, ctx, lock, formatCode(parsed, rules.positions), 'set', 'imported', null)
  if (serial !== null)
    db.run('UPDATE lock SET serial_number = $s WHERE id = $id', {
      $s: serial.trim() || null,
      $id: lockId
    })
}

export { codeAt }

/** Lockers with any code in the file: on the lock now, in its history, or in a code set. */
export function lockersWithAnyCode(db: LockerDb): string[] {
  return db
    .all<{ locker_id: string }>(
      `SELECT locker_id FROM lock WHERE locker_id IS NOT NULL AND code_cipher IS NOT NULL
       UNION SELECT k.locker_id FROM code_history h JOIN lock k ON k.id = h.lock_id
              WHERE k.locker_id IS NOT NULL AND h.code_cipher IS NOT NULL
       UNION SELECT locker_id FROM code_set_entry WHERE locker_id IS NOT NULL`
    )
    .map((r) => r.locker_id)
}

/** Spare codes held in code sets, not tied to any locker. */
export function spareCodeCount(db: LockerDb): number {
  return Number(
    db.get<{ n: number }>('SELECT COUNT(*) AS n FROM code_set_entry WHERE locker_id IS NULL')?.n ??
      0
  )
}

/** Records that codes left the app (SPEC.md 3.10). A null locker means the spare codes. */
export function logReveal(
  db: LockerDb,
  ctx: OperatorContext,
  lockerId: string | null,
  where: 'screen' | 'letter' | 'export' | 'report'
): void {
  const holder = lockerId
    ? db.get<{ student_id: string }>(
        "SELECT student_id FROM assignment WHERE locker_id = $l AND status = 'current' LIMIT 1",
        { $l: lockerId }
      )
    : undefined
  const s = stamp(ctx)
  db.run(
    `INSERT INTO code_reveal_log (id, at, operator, machine, student_id, locker_id, revealed_in, created_at, updated_at, updated_by)
     VALUES ($id, $at, $op, $m, $st, $l, $w, $at, $at, $op)`,
    {
      $id: newId(),
      $at: s.created_at,
      $op: ctx.operator,
      $m: ctx.machine,
      $st: holder?.student_id ?? null,
      $l: lockerId,
      $w: where
    }
  )
}

const RESERVED_KEY = 'codes.reservedForNextYear'

/** Year code sets made while lockers are out: kept for next year, not used before it. */
export function reservedSetIds(db: LockerDb): string[] {
  const row = db.get<{ value: string }>('SELECT value FROM settings WHERE key = $k', {
    $k: RESERVED_KEY
  })
  try {
    const v: unknown = row ? JSON.parse(row.value) : []
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function reserveSetForNextYear(db: LockerDb, ctx: OperatorContext, setId: string): void {
  setSetting(db, ctx, RESERVED_KEY, [...new Set([...reservedSetIds(db), setId])])
}

/** At the rollover: the reserved sets become the new year's. */
export function releaseReservedSets(db: LockerDb, ctx: OperatorContext, newYearId: string): number {
  const ids = reservedSetIds(db)
  for (const id of ids)
    db.run(
      'UPDATE code_set SET school_year_id = $y, updated_at = $at, updated_by = $by WHERE id = $id',
      {
        $id: id,
        $y: newYearId,
        $at: ctx.now().toISOString(),
        $by: ctx.operator
      }
    )
  db.run('DELETE FROM settings WHERE key = $k', { $k: RESERVED_KEY })
  return ids.length
}
