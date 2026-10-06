import m001 from './migrations/001_initial.sql?raw'
import type { LockerDb } from './db'

export interface Migration {
  version: number
  name: string
  sql: string
}

/** Every migration, in order. Append only; never edit one that has shipped. */
export const migrations: readonly Migration[] = [{ version: 1, name: '001_initial', sql: m001 }]

export const LATEST_SCHEMA_VERSION = migrations[migrations.length - 1]?.version ?? 0

export type SchemaState =
  | { kind: 'current'; version: number }
  | { kind: 'older'; from: number; to: number }
  | { kind: 'newer'; fileVersion: number; appVersion: number }

export function schemaState(db: LockerDb, list: readonly Migration[] = migrations): SchemaState {
  const latest = list[list.length - 1]?.version ?? 0
  const v = db.userVersion
  if (v === latest) return { kind: 'current', version: v }
  if (v > latest) return { kind: 'newer', fileVersion: v, appVersion: latest }
  return { kind: 'older', from: v, to: latest }
}

/** Throws if the list is not 1, 2, 3 ... with no gaps or repeats. */
export function assertMigrationList(list: readonly Migration[]): void {
  list.forEach((m, i) => {
    if (m.version !== i + 1)
      throw new Error(`Migration ${m.name} has version ${m.version}, expected ${i + 1}`)
  })
}

/**
 * Brings the database up to the newest schema. Each migration runs in its own
 * transaction together with the version bump, so a failure leaves the database
 * at the last good version. Callers take a named backup first (SPEC.md 6.6).
 */
export function migrate(
  db: LockerDb,
  list: readonly Migration[] = migrations
): { from: number; to: number } {
  assertMigrationList(list)
  const from = db.userVersion
  const latest = list[list.length - 1]?.version ?? 0
  if (from > latest) throw new Error(`This file was made by a newer version (schema ${from}).`)
  for (const m of list) {
    if (m.version <= from) continue
    db.transaction(() => {
      db.execScript(m.sql)
      db.userVersion = m.version
    })
  }
  const problems = db.integrityProblems()
  if (problems.length > 0) throw new Error(`Integrity check failed after migrating: ${problems[0]}`)
  if (db.foreignKeyProblems() > 0) throw new Error('Foreign key check failed after migrating.')
  return { from, to: db.userVersion }
}
