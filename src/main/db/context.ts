import { randomUUID } from 'node:crypto'
import type { LockerDb } from './db'

/** Who is making a change, from where, and when. Passed to every write. */
export interface OperatorContext {
  operator: string
  machine: string
  now: () => Date
}

export function newId(): string {
  return randomUUID()
}

export function stamp(ctx: OperatorContext): {
  created_at: string
  updated_at: string
  updated_by: string
} {
  const at = ctx.now().toISOString()
  return { created_at: at, updated_at: at, updated_by: ctx.operator }
}

export interface AuditEntry {
  action: string
  entity: string
  entityId?: string | null
  before?: unknown
  after?: unknown
  reason?: string | null
}

/** Appends one line to the history. The table refuses updates and deletes. */
export function appendAudit(db: LockerDb, ctx: OperatorContext, entry: AuditEntry): void {
  const at = ctx.now().toISOString()
  db.run(
    `INSERT INTO audit_log (id, at, operator, machine, action, entity, entity_id, before, after, reason,
                            created_at, updated_at, updated_by)
     VALUES ($id, $at, $operator, $machine, $action, $entity, $entityId, $before, $after, $reason, $at, $at, $operator)`,
    {
      $id: newId(),
      $at: at,
      $operator: ctx.operator,
      $machine: ctx.machine,
      $action: entry.action,
      $entity: entry.entity,
      $entityId: entry.entityId ?? null,
      $before: entry.before === undefined ? null : JSON.stringify(entry.before),
      $after: entry.after === undefined ? null : JSON.stringify(entry.after),
      $reason: entry.reason ?? null
    }
  )
}

export function getMeta(db: LockerDb, key: string): string | undefined {
  const row = db.get<{ value: string }>('SELECT value FROM meta WHERE key = $key', { $key: key })
  return row?.value
}

export function setMeta(db: LockerDb, key: string, value: string): void {
  db.run(
    'INSERT INTO meta (key, value) VALUES ($key, $value) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    {
      $key: key,
      $value: value
    }
  )
}
