import type { RecordRestorePreview } from '@shared/history'
import type { LockerDb } from './db/db'
import type { OperatorContext } from './db/context'
import type { DataFileSession } from './file/session'

// "Restore this record to how it was" (SPEC.md 4.12). A backup is kept on every
// save, so the record as it stood before a change is in the first backup written
// after that change that does not yet contain it. Only a student's or a locker's
// own details are put back; lockers given out, codes and history are not touched.

const FIELDS = {
  student: [
    ['first_name', 'First name'],
    ['last_name', 'Last name'],
    ['preferred_name', 'Preferred name'],
    ['name_override', 'Name corrected by hand'],
    ['year_level', 'Year level'],
    ['group_code', 'Group'],
    ['house', 'House'],
    ['needs_accessible', 'Needs an accessible locker'],
    ['email', 'Email'],
    ['active', 'Still at the school'],
    ['left_at', 'Left on']
  ],
  locker: [
    ['accessible', 'Accessible'],
    ['capacity', 'Students who share it'],
    ['status', 'Status'],
    ['out_of_service_reason', 'Why out of service'],
    ['out_of_service_date', 'Out of service since'],
    ['notes', 'Notes']
  ]
} as const

type Entity = keyof typeof FIELDS

function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return '(empty)'
  return String(v)
}

interface Found {
  entity: Entity
  entityId: string
  values: Record<string, unknown>
  backupAt: string
}

async function findBefore(session: DataFileSession, entryId: string): Promise<Found> {
  const entry = session.read((db) =>
    db.get<{ entity: string; entity_id: string | null; at: string }>(
      'SELECT entity, entity_id, at FROM audit_log WHERE id = $id',
      { $id: entryId }
    )
  )
  if (!entry) throw new Error('That history line is no longer in the file.')
  if (!entry.entity_id || !(entry.entity in FIELDS))
    throw new Error('Only a student or a locker can be put back from the history.')
  const entity = entry.entity as Entity
  const candidates = (await session.listAllBackups())
    .filter((b) => b.at >= entry.at)
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(0, 8)
  for (const b of candidates) {
    const db = await session.loadBackup(b)
    if (!db) continue
    try {
      const has = db.get('SELECT 1 AS x FROM audit_log WHERE id = $id', { $id: entryId })
      if (has) continue
      const cols = FIELDS[entity].map(([c]) => c).join(', ')
      const row = db.get<Record<string, unknown>>(`SELECT ${cols} FROM ${entity} WHERE id = $id`, {
        $id: entry.entity_id
      })
      if (!row) throw new Error('That record did not exist before this change.')
      return { entity, entityId: entry.entity_id, values: row, backupAt: b.at }
    } finally {
      db.close()
    }
  }
  throw new Error(
    'No backup from before this change was found, so the record cannot be put back from here.'
  )
}

function holders(db: LockerDb, lockerId: string): number {
  return Number(
    db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM assignment WHERE locker_id = $id AND status = 'current'",
      { $id: lockerId }
    )?.n ?? 0
  )
}

/**
 * Why putting these old values back would break a rule the normal screens keep, or
 * null when it is safe. Lockers given out are not touched by a put-back, so a held
 * locker cannot go out of service or take fewer students than hold it, and a
 * student who holds a locker cannot be marked as left (spec audit, gap 4).
 */
export function restoreProblem(
  db: LockerDb,
  entity: Entity,
  entityId: string,
  values: Record<string, unknown>
): string | null {
  if (entity === 'locker') {
    const n = holders(db, entityId)
    if (n === 0) return null
    const who = n === 1 ? 'A student holds' : `${n} students hold`
    if (values.status === 'out_of_service')
      return `${who} this locker now, so it cannot go back to out of service. Move them to another locker first, then put it back.`
    if (Number(values.capacity) < n)
      return `${who} this locker now, so it must take at least ${n}. Move a student first, then put it back.`
    return null
  }
  if (Number(values.active) === 0) {
    const holds = db.get(
      "SELECT 1 AS x FROM assignment WHERE student_id = $id AND status = 'current'",
      { $id: entityId }
    )
    if (holds)
      return 'This student still holds a locker, so they cannot be put back as left. Use "Student has left" so the locker is freed and its code changed.'
  }
  return null
}

function differences(db: LockerDb, f: Found): RecordRestorePreview['changes'] {
  const cols = FIELDS[f.entity].map(([c]) => c).join(', ')
  const now = db.get<Record<string, unknown>>(`SELECT ${cols} FROM ${f.entity} WHERE id = $id`, {
    $id: f.entityId
  })
  if (!now) throw new Error('That record is no longer in the file.')
  return FIELDS[f.entity]
    .filter(([c]) => show(now[c]) !== show(f.values[c]))
    .map(([c, label]) => ({ field: label, now: show(now[c]), before: show(f.values[c]) }))
}

export async function previewRecordRestore(
  session: DataFileSession,
  entryId: string
): Promise<RecordRestorePreview> {
  const f = await findBefore(session, entryId)
  return {
    entity: f.entity,
    backupAt: f.backupAt,
    ...session.read((db) => ({
      changes: differences(db, f),
      blocked: restoreProblem(db, f.entity, f.entityId, f.values)
    }))
  }
}

export async function restoreRecord(
  session: DataFileSession,
  entryId: string
): Promise<RecordRestorePreview> {
  const f = await findBefore(session, entryId)
  return session.write(
    (r: RecordRestorePreview) => ({
      action: 'record.restored',
      entity: f.entity,
      entityId: f.entityId,
      after: { fields: r.changes.map((c) => c.field), from: f.backupAt }
    }),
    (db: LockerDb, ctx: OperatorContext) => {
      const changes = differences(db, f)
      const blocked = restoreProblem(db, f.entity, f.entityId, f.values)
      if (blocked) throw new Error(blocked)
      const sets = FIELDS[f.entity].map(([c]) => `${c} = $${c}`).join(', ')
      const params: Record<string, string | number | null> = {
        $id: f.entityId,
        $at: ctx.now().toISOString(),
        $by: ctx.operator
      }
      for (const [c] of FIELDS[f.entity])
        params[`$${c}`] = (f.values[c] ?? null) as string | number | null
      db.run(
        `UPDATE ${f.entity} SET ${sets}, updated_at = $at, updated_by = $by WHERE id = $id`,
        params
      )
      return { entity: f.entity, backupAt: f.backupAt, changes, blocked: null }
    }
  )
}
