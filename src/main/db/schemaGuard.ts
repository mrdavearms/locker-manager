import { LockerDb } from './db'
import { migrate, migrations } from './migrate'

// A data file sits in a shared folder, so anyone who can write there can edit it with
// any SQLite tool. Triggers run inside every later change, made by whoever is editing,
// and are saved and backed up with the file; views are never made by the app. So a
// file keeps only the triggers its schema version's migrations make, exactly as they
// make them, and loses any view (security audit run-1, planted triggers).

const expectedCache = new Map<number, Map<string, string>>()

/** The triggers migrations 1 to `version` make, by name, with their SQL. */
async function expectedTriggers(version: number): Promise<Map<string, string>> {
  const cached = expectedCache.get(version)
  if (cached) return cached
  const db = await LockerDb.create()
  try {
    migrate(db, migrations.slice(0, version))
    const map = new Map(
      db
        .all<{ name: string; sql: string }>(
          "SELECT name, sql FROM sqlite_master WHERE type = 'trigger'"
        )
        .map((r) => [r.name, r.sql])
    )
    expectedCache.set(version, map)
    return map
  } finally {
    db.close()
  }
}

const quoted = (name: string): string => `"${name.replace(/"/g, '""')}"`

/**
 * The same trigger, ignoring line endings: a copy built from a Windows checkout made its
 * triggers with CRLF, and a Mac copy with LF. Without this, each treated the other's
 * file as tampered with.
 */
const sameSql = (a: string | null | undefined, b: string | null): boolean =>
  a != null && b != null && a.replace(/\r\n/g, '\n') === b.replace(/\r\n/g, '\n')

export interface SchemaRepair {
  removed: string[]
  restored: string[]
}

/**
 * Drops every view, and every trigger the app's migrations for this file's schema
 * version do not make; puts back any of the app's own triggers that are missing or
 * changed. Run before migrating (so nothing planted fires during a migration) and
 * again after. A file from a newer app version is left alone: it opens read-only.
 */
export async function repairSchemaObjects(db: LockerDb): Promise<SchemaRepair> {
  const version = db.userVersion
  const repair: SchemaRepair = { removed: [], restored: [] }
  if (version < 1 || version > migrations.length) return repair
  const expected = await expectedTriggers(version)
  const objects = (type: 'trigger' | 'view'): { name: string; sql: string | null }[] =>
    db.all<{ name: string; sql: string | null }>(
      'SELECT name, sql FROM sqlite_master WHERE type = ?',
      [type]
    )
  db.transaction(() => {
    // Views first: dropping a view also drops any trigger on it, so the triggers are
    // read only once the views are gone.
    for (const v of objects('view')) {
      db.run(`DROP VIEW ${quoted(v.name)}`)
      repair.removed.push(v.name)
    }
    for (const t of objects('trigger')) {
      if (sameSql(expected.get(t.name), t.sql)) continue
      db.run(`DROP TRIGGER ${quoted(t.name)}`)
      repair.removed.push(t.name)
    }
    const kept = new Set(
      db
        .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'trigger'")
        .map((r) => r.name)
    )
    for (const [name, sql] of expected) {
      if (kept.has(name)) continue
      db.execScript(sql)
      repair.restored.push(name)
    }
  })
  return repair
}
