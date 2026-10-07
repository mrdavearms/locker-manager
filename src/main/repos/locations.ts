import type { AreaView, BankView, LockerView } from '@shared/locations'
import { LOCK_TYPE_INFO, type LockDefaults, type LockType } from '@shared/locks'
import type { LockerDb } from '../db/db'
import { newId, stamp, type OperatorContext } from '../db/context'
import {
  compareLockerNumbers,
  duplicateNumbers,
  lockerSortKey,
  planBulkLockers,
  qrIdentifier,
  type PlannedLocker
} from '../locations/lockerNumbers'

// Areas, banks and lockers (SPEC.md 3.3). Nothing is hard-deleted: areas and
// banks are archived only when empty, lockers only when nobody holds them.

function ts(ctx: OperatorContext) {
  const s = stamp(ctx)
  return { $c: s.created_at, $u: s.updated_at, $by: s.updated_by }
}

export function listAreas(db: LockerDb): AreaView[] {
  const areas = db.all<{
    id: string
    name: string
    description: string | null
    colour: string | null
    sort_order: number
    default_year_levels: string
  }>(
    'SELECT id, name, description, colour, sort_order, default_year_levels FROM area WHERE archived_at IS NULL ORDER BY sort_order, name'
  )
  const banks = db.all<{
    id: string
    area_id: string
    name: string
    sort_order: number
    layout_rows: number | null
    layout_columns: number | null
    notes: string | null
    n: number
  }>(
    `SELECT b.id, b.area_id, b.name, b.sort_order, b.layout_rows, b.layout_columns, b.notes,
            (SELECT COUNT(*) FROM locker l WHERE l.bank_id = b.id AND l.archived_at IS NULL) AS n
       FROM bank b WHERE b.archived_at IS NULL ORDER BY b.sort_order, b.name`
  )
  return areas.map((a) => ({
    id: String(a.id),
    name: String(a.name),
    description: a.description,
    colour: a.colour,
    sortOrder: Number(a.sort_order),
    defaultYearLevels: safeArray(a.default_year_levels),
    banks: banks
      .filter((b) => b.area_id === a.id)
      .map((b): BankView => ({
        id: String(b.id),
        areaId: String(b.area_id),
        name: String(b.name),
        sortOrder: Number(b.sort_order),
        rows: b.layout_rows === null ? null : Number(b.layout_rows),
        columns: b.layout_columns === null ? null : Number(b.layout_columns),
        notes: b.notes,
        lockerCount: Number(b.n)
      }))
  }))
}

function safeArray(json: string): string[] {
  try {
    const v: unknown = JSON.parse(json)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function requireName(name: string, what: string): string {
  const n = name.trim()
  if (n.length === 0) throw new Error(`The ${what} needs a name.`)
  if (n.length > 80) throw new Error(`The ${what} name is too long.`)
  return n
}

export function createArea(
  db: LockerDb,
  ctx: OperatorContext,
  input: {
    name: string
    description?: string | null
    colour?: string | null
    defaultYearLevels?: string[]
  }
): string {
  const name = requireName(input.name, 'area')
  if (
    db.get('SELECT 1 FROM area WHERE lower(name) = lower($n) AND archived_at IS NULL', { $n: name })
  ) {
    throw new Error(`There is already an area called "${name}".`)
  }
  const id = newId()
  const order = Number(
    db.get<{ n: number }>('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM area')?.n ?? 0
  )
  db.run(
    `INSERT INTO area (id, name, description, sort_order, colour, default_year_levels, created_at, updated_at, updated_by)
     VALUES ($id, $name, $d, $o, $col, $yl, $c, $u, $by)`,
    {
      $id: id,
      $name: name,
      $d: input.description?.trim() || null,
      $o: order,
      $col: input.colour ?? null,
      $yl: JSON.stringify(input.defaultYearLevels ?? []),
      ...ts(ctx)
    }
  )
  return id
}

export function updateArea(
  db: LockerDb,
  ctx: OperatorContext,
  id: string,
  patch: {
    name?: string
    description?: string | null
    colour?: string | null
    defaultYearLevels?: string[]
    sortOrder?: number
  }
): void {
  const name = patch.name === undefined ? null : requireName(patch.name, 'area')
  db.run(
    `UPDATE area SET name = COALESCE($name, name),
       description = CASE WHEN $setD THEN $d ELSE description END,
       colour = CASE WHEN $setC THEN $col ELSE colour END,
       default_year_levels = COALESCE($yl, default_year_levels),
       sort_order = COALESCE($o, sort_order),
       updated_at = $u, updated_by = $by WHERE id = $id`,
    {
      $id: id,
      $name: name,
      $setD: patch.description !== undefined ? 1 : 0,
      $d: patch.description?.trim() || null,
      $setC: patch.colour !== undefined ? 1 : 0,
      $col: patch.colour ?? null,
      $yl: patch.defaultYearLevels ? JSON.stringify(patch.defaultYearLevels) : null,
      $o: patch.sortOrder ?? null,
      $u: ctx.now().toISOString(),
      $by: ctx.operator
    }
  )
}

export function archiveArea(db: LockerDb, ctx: OperatorContext, id: string): void {
  const live = db.get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM bank WHERE area_id = $id AND archived_at IS NULL',
    { $id: id }
  )
  if (Number(live?.n ?? 0) > 0) throw new Error('Remove or move the banks in this area first.')
  db.run('UPDATE area SET archived_at = $at, updated_at = $at, updated_by = $by WHERE id = $id', {
    $id: id,
    $at: ctx.now().toISOString(),
    $by: ctx.operator
  })
}

export function createBank(
  db: LockerDb,
  ctx: OperatorContext,
  input: { areaId: string; name: string; notes?: string | null }
): string {
  const name = requireName(input.name, 'bank')
  if (!db.get('SELECT 1 FROM area WHERE id = $id AND archived_at IS NULL', { $id: input.areaId }))
    throw new Error('That area no longer exists.')
  const id = newId()
  const order = Number(
    db.get<{ n: number }>(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM bank WHERE area_id = $a',
      { $a: input.areaId }
    )?.n ?? 0
  )
  db.run(
    `INSERT INTO bank (id, area_id, name, sort_order, notes, created_at, updated_at, updated_by)
     VALUES ($id, $a, $name, $o, $notes, $c, $u, $by)`,
    {
      $id: id,
      $a: input.areaId,
      $name: name,
      $o: order,
      $notes: input.notes?.trim() || null,
      ...ts(ctx)
    }
  )
  return id
}

export function updateBank(
  db: LockerDb,
  ctx: OperatorContext,
  id: string,
  patch: { name?: string; areaId?: string; notes?: string | null; sortOrder?: number }
): void {
  const name = patch.name === undefined ? null : requireName(patch.name, 'bank')
  db.run(
    `UPDATE bank SET name = COALESCE($name, name), area_id = COALESCE($a, area_id),
       notes = CASE WHEN $setN THEN $notes ELSE notes END, sort_order = COALESCE($o, sort_order),
       updated_at = $u, updated_by = $by WHERE id = $id`,
    {
      $id: id,
      $name: name,
      $a: patch.areaId ?? null,
      $setN: patch.notes !== undefined ? 1 : 0,
      $notes: patch.notes?.trim() || null,
      $o: patch.sortOrder ?? null,
      $u: ctx.now().toISOString(),
      $by: ctx.operator
    }
  )
}

export function archiveBank(db: LockerDb, ctx: OperatorContext, id: string): void {
  const live = db.get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM locker WHERE bank_id = $id AND archived_at IS NULL',
    { $id: id }
  )
  if (Number(live?.n ?? 0) > 0) throw new Error('Remove the lockers in this bank first.')
  db.run('UPDATE bank SET archived_at = $at, updated_at = $at, updated_by = $by WHERE id = $id', {
    $id: id,
    $at: ctx.now().toISOString(),
    $by: ctx.operator
  })
}

export function existingLockerNumbers(db: LockerDb): string[] {
  return db
    .all<{ number: string }>('SELECT number FROM locker WHERE archived_at IS NULL')
    .map((r) => String(r.number))
}

function initialCodeStatus(type: LockType): string {
  return LOCK_TYPE_INFO[type].hasCode ? 'reset_no_code' : 'not_applicable'
}

/** Adds lockers to a bank, each with a lock of the given kind (or none). */
export function addLockers(
  db: LockerDb,
  ctx: OperatorContext,
  input: {
    bankId: string
    planned: readonly PlannedLocker[]
    capacity?: number
    lock: LockDefaults | null
  }
): number {
  if (!db.get('SELECT 1 FROM bank WHERE id = $id AND archived_at IS NULL', { $id: input.bankId }))
    throw new Error('That bank no longer exists.')
  if (input.planned.length === 0) throw new Error('No lockers to add.')
  const dupes = duplicateNumbers(
    input.planned.map((p) => p.number),
    existingLockerNumbers(db)
  )
  if (dupes.length > 0) {
    throw new Error(
      `These locker numbers are already used: ${dupes.slice(0, 10).join(', ')}${dupes.length > 10 ? ` and ${dupes.length - 10} more` : ''}.`
    )
  }
  const t = ts(ctx)
  const used = new Set(
    db.all<{ qr_id: string }>('SELECT qr_id FROM locker').map((r) => String(r.qr_id))
  )
  for (const p of input.planned) {
    const id = newId()
    let qr = qrIdentifier()
    while (used.has(qr)) qr = qrIdentifier()
    used.add(qr)
    db.run(
      `INSERT INTO locker (id, number, sort_key, bank_id, position_row, position_column, tier, capacity, qr_id, created_at, updated_at, updated_by)
       VALUES ($id, $n, $k, $b, $r, $col, $tier, $cap, $qr, $c, $u, $by)`,
      {
        $id: id,
        $n: p.number.trim(),
        $k: lockerSortKey(p.number),
        $b: input.bankId,
        $r: p.row,
        $col: p.column,
        $tier: p.tier,
        $cap: input.capacity ?? 1,
        $qr: qr,
        ...t
      }
    )
    if (input.lock) {
      db.run(
        `INSERT INTO lock (id, type, manufacturer, model, dials, positions_per_dial, locker_id, code_status, created_at, updated_at, updated_by)
         VALUES ($id, $type, $m, $model, $d, $p, $l, $cs, $c, $u, $by)`,
        {
          $id: newId(),
          $type: input.lock.type,
          $m: input.lock.manufacturer ?? null,
          $model: input.lock.model ?? null,
          $d: LOCK_TYPE_INFO[input.lock.type].hasCode ? input.lock.dials : null,
          $p: LOCK_TYPE_INFO[input.lock.type].hasCode ? input.lock.positionsPerDial : null,
          $l: id,
          $cs: initialCodeStatus(input.lock.type),
          ...t
        }
      )
    }
  }
  const maxes = db.get<{ r: number; c: number }>(
    'SELECT MAX(position_row) AS r, MAX(position_column) AS c FROM locker WHERE bank_id = $b AND archived_at IS NULL',
    { $b: input.bankId }
  )
  db.run('UPDATE bank SET layout_rows = $r, layout_columns = $c WHERE id = $b', {
    $r: maxes?.r ?? null,
    $c: maxes?.c ?? null,
    $b: input.bankId
  })
  return input.planned.length
}

/**
 * Set-up's quick start for a school with one run of lockers: one area, one bank and
 * every locker numbered from `firstNumber`, one high, each with the given lock.
 */
export function quickStartLockers(
  db: LockerDb,
  ctx: OperatorContext,
  input: {
    areaName: string
    bankName: string
    count: number
    firstNumber: number
    lock: LockDefaults
  }
): number {
  if (db.get('SELECT 1 FROM area WHERE archived_at IS NULL'))
    throw new Error('This file already has lockers set up. Use the full editor to add more.')
  const areaId = createArea(db, ctx, { name: input.areaName })
  const bankId = createBank(db, ctx, { areaId, name: input.bankName })
  return addLockers(db, ctx, {
    bankId,
    planned: planBulkLockers({
      prefix: '',
      from: input.firstNumber,
      to: input.firstNumber + input.count - 1,
      padTo: 0,
      tiers: 1,
      order: 'down_then_across'
    }),
    lock: input.lock
  })
}

type LockerRow = {
  id: string
  number: string
  bank_id: string
  position_row: number | null
  position_column: number | null
  tier: LockerView['tier']
  capacity: number
  accessible: number
  status: LockerView['status']
  out_of_service_reason: string | null
  notes: string | null
  lock_type: LockType | null
  code_status: string | null
}

export function listLockers(db: LockerDb, filter: { bankId?: string } = {}): LockerView[] {
  const rows = db.all<LockerRow>(
    `SELECT l.id, l.number, l.bank_id, l.position_row, l.position_column, l.tier, l.capacity, l.accessible, l.status,
            l.out_of_service_reason, l.notes,
            (SELECT k.type FROM lock k WHERE k.locker_id = l.id AND k.status IN ('in_use','spare') LIMIT 1) AS lock_type,
            (SELECT k.code_status FROM lock k WHERE k.locker_id = l.id AND k.status IN ('in_use','spare') LIMIT 1) AS code_status
       FROM locker l
      WHERE l.archived_at IS NULL ${filter.bankId ? 'AND l.bank_id = $b' : ''}
      ORDER BY l.sort_key`,
    filter.bankId ? { $b: filter.bankId } : undefined
  )
  const holders = db.all<{
    locker_id: string
    student_id: string
    first_name: string
    last_name: string
    preferred_name: string | null
    group_code: string | null
  }>(
    `SELECT a.locker_id, s.id AS student_id, s.first_name, s.last_name, s.preferred_name, s.group_code
       FROM assignment a JOIN student s ON s.id = a.student_id WHERE a.status = 'current'`
  )
  const byLocker = new Map<string, LockerView['holders']>()
  for (const h of holders) {
    const list = byLocker.get(h.locker_id) ?? []
    list.push({
      studentId: h.student_id,
      name: `${h.preferred_name || h.first_name} ${h.last_name}`,
      group: h.group_code
    })
    byLocker.set(h.locker_id, list)
  }
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    bankId: r.bank_id,
    row: r.position_row,
    column: r.position_column,
    tier: r.tier,
    capacity: Number(r.capacity),
    accessible: Number(r.accessible) === 1,
    status: r.status,
    outOfServiceReason: r.out_of_service_reason,
    notes: r.notes,
    lockType: r.lock_type,
    codeStatus: r.code_status,
    holders: byLocker.get(r.id) ?? []
  }))
}

export function updateLocker(
  db: LockerDb,
  ctx: OperatorContext,
  id: string,
  patch: {
    capacity?: number
    accessible?: boolean
    status?: LockerView['status']
    outOfServiceReason?: string | null
    notes?: string | null
    tier?: LockerView['tier']
  }
): void {
  if (patch.capacity !== undefined) {
    if (!Number.isInteger(patch.capacity) || patch.capacity < 1 || patch.capacity > 6)
      throw new Error('A locker holds 1 to 6 students.')
    const holders = Number(
      db.get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM assignment WHERE locker_id = $id AND status = 'current'",
        { $id: id }
      )?.n ?? 0
    )
    if (patch.capacity < holders)
      throw new Error(
        `${holders} students hold this locker now, so it must take at least ${holders}.`
      )
  }
  if (patch.status === 'out_of_service' && !patch.outOfServiceReason?.trim())
    throw new Error('Say why the locker is out of service.')
  const at = ctx.now().toISOString()
  db.run(
    `UPDATE locker SET capacity = COALESCE($cap, capacity), accessible = COALESCE($acc, accessible),
       status = COALESCE($st, status),
       out_of_service_reason = CASE WHEN $st IS NULL THEN out_of_service_reason WHEN $st = 'out_of_service' THEN $why ELSE NULL END,
       out_of_service_date = CASE WHEN $st IS NULL THEN out_of_service_date WHEN $st = 'out_of_service' THEN $day ELSE NULL END,
       notes = CASE WHEN $setN THEN $notes ELSE notes END,
       tier = CASE WHEN $setT THEN $tier ELSE tier END,
       updated_at = $at, updated_by = $by WHERE id = $id`,
    {
      $id: id,
      $cap: patch.capacity ?? null,
      $acc: patch.accessible === undefined ? null : patch.accessible ? 1 : 0,
      $st: patch.status ?? null,
      $why: patch.outOfServiceReason?.trim() || null,
      $day: at.slice(0, 10),
      $setN: patch.notes !== undefined ? 1 : 0,
      $notes: patch.notes?.trim() || null,
      $setT: patch.tier !== undefined ? 1 : 0,
      $tier: patch.tier ?? null,
      $at: at,
      $by: ctx.operator
    }
  )
}

/**
 * The deliberate "Renumber lockers" tool (SPEC.md principle 2): the only way a
 * locker number changes. The database refuses any other change to it.
 */
export function renumberLocker(
  db: LockerDb,
  ctx: OperatorContext,
  id: string,
  newNumber: string
): { from: string; to: string } {
  const to = newNumber.trim()
  if (to.length === 0 || to.length > 20) throw new Error('A locker number is 1 to 20 characters.')
  const current = db.get<{ number: string }>(
    'SELECT number FROM locker WHERE id = $id AND archived_at IS NULL',
    { $id: id }
  )
  if (!current) throw new Error('That locker no longer exists.')
  if (current.number === to) return { from: current.number, to }
  if (
    db.get(
      'SELECT 1 FROM locker WHERE lower(number) = lower($n) AND archived_at IS NULL AND id <> $id',
      { $n: to, $id: id }
    )
  ) {
    throw new Error(`Locker ${to} already exists.`)
  }
  db.transaction(() => {
    db.run(
      "INSERT INTO meta (key, value) VALUES ('renumber_in_progress', '1') ON CONFLICT (key) DO UPDATE SET value = '1'"
    )
    db.run(
      'UPDATE locker SET number = $n, sort_key = $k, updated_at = $at, updated_by = $by WHERE id = $id',
      {
        $n: to,
        $k: lockerSortKey(to),
        $at: ctx.now().toISOString(),
        $by: ctx.operator,
        $id: id
      }
    )
    db.run("DELETE FROM meta WHERE key = 'renumber_in_progress'")
  })
  return { from: current.number, to }
}

export function archiveLocker(db: LockerDb, ctx: OperatorContext, id: string): void {
  if (
    db.get("SELECT 1 FROM assignment WHERE locker_id = $id AND status = 'current'", { $id: id })
  ) {
    throw new Error('Someone holds this locker. Move them first.')
  }
  const at = ctx.now().toISOString()
  db.run('UPDATE locker SET archived_at = $at, updated_at = $at, updated_by = $by WHERE id = $id', {
    $id: id,
    $at: at,
    $by: ctx.operator
  })
  db.run(
    "UPDATE lock SET locker_id = NULL, status = 'spare', updated_at = $at, updated_by = $by WHERE locker_id = $id",
    { $id: id, $at: at, $by: ctx.operator }
  )
}

/** Sets the lock kind for every locker in a bank (SPEC.md 4.1 step 5). */
export function setBankLocks(
  db: LockerDb,
  ctx: OperatorContext,
  bankId: string,
  lock: LockDefaults
): number {
  const lockers = db.all<{ id: string }>(
    'SELECT id FROM locker WHERE bank_id = $b AND archived_at IS NULL',
    { $b: bankId }
  )
  const t = ts(ctx)
  const info = LOCK_TYPE_INFO[lock.type]
  for (const l of lockers) {
    const existing = db.get<{ id: string; type: LockType }>(
      "SELECT id, type FROM lock WHERE locker_id = $l AND status IN ('in_use','spare')",
      { $l: l.id }
    )
    if (existing) {
      const typeChanged = existing.type !== lock.type
      db.run(
        `UPDATE lock SET type = $type, manufacturer = $m, model = $model, dials = $d, positions_per_dial = $p,
           code_status = CASE WHEN $changed THEN $cs ELSE code_status END,
           code_cipher = CASE WHEN $changed THEN NULL ELSE code_cipher END,
           updated_at = $u, updated_by = $by WHERE id = $id`,
        {
          $id: existing.id,
          $type: lock.type,
          $m: lock.manufacturer ?? null,
          $model: lock.model ?? null,
          $d: info.hasCode ? lock.dials : null,
          $p: info.hasCode ? lock.positionsPerDial : null,
          $changed: typeChanged ? 1 : 0,
          $cs: initialCodeStatus(lock.type),
          $u: t.$u,
          $by: t.$by
        }
      )
    } else {
      db.run(
        `INSERT INTO lock (id, type, manufacturer, model, dials, positions_per_dial, locker_id, code_status, created_at, updated_at, updated_by)
         VALUES ($id, $type, $m, $model, $d, $p, $l, $cs, $c, $u, $by)`,
        {
          $id: newId(),
          $type: lock.type,
          $m: lock.manufacturer ?? null,
          $model: lock.model ?? null,
          $d: info.hasCode ? lock.dials : null,
          $p: info.hasCode ? lock.positionsPerDial : null,
          $l: l.id,
          $cs: initialCodeStatus(lock.type),
          ...t
        }
      )
    }
  }
  return lockers.length
}

export function sortLockers<T extends { number: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => compareLockerNumbers(a.number, b.number))
}
