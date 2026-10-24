import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LockerDb } from '../../../src/main/db/db'
import { migrate } from '../../../src/main/db/migrate'
import { repairSchemaObjects } from '../../../src/main/db/schemaGuard'

// A file edited outside the app keeps only the triggers the app makes (security
// audit run-1, planted triggers). Every fixture is SYNTHETIC.

const DIR = join('tests', 'fixtures', 'schema')
const files = readdirSync(DIR).filter((f) => /^v\d+-SYNTHETIC\.lockers$/.test(f))
const open = (file: string): Promise<LockerDb> =>
  LockerDb.fromBytes(new Uint8Array(readFileSync(join(DIR, file))))
const objects = (db: LockerDb): string[] =>
  db
    .all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type IN ('trigger','view') ORDER BY name"
    )
    .map((r) => r.name)

describe('triggers and views made outside the app', () => {
  it.each(files)('%s is left exactly as the app made it, before and after migrating', async (f) => {
    const db = await open(f)
    expect(await repairSchemaObjects(db)).toEqual({ removed: [], restored: [] })
    migrate(db)
    expect(await repairSchemaObjects(db)).toEqual({ removed: [], restored: [] })
    db.close()
  })

  it('removes a planted trigger and view, and puts back a guard that was dropped or changed', async () => {
    const db = await open('v5-SYNTHETIC.lockers')
    const appObjects = objects(db)
    db.execScript(`
      DROP TRIGGER code_reveal_log_no_delete;
      DROP TRIGGER audit_log_no_update;
      CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log BEGIN SELECT 1; END;
      CREATE TRIGGER planted AFTER INSERT ON code_reveal_log
        BEGIN DELETE FROM code_reveal_log WHERE id = NEW.id; END;
      CREATE VIEW planted_view AS SELECT 1 AS x;
    `)
    const repair = await repairSchemaObjects(db)
    expect(repair.removed.sort()).toEqual(['audit_log_no_update', 'planted', 'planted_view'])
    expect(repair.restored.sort()).toEqual(['audit_log_no_update', 'code_reveal_log_no_delete'])
    expect(objects(db)).toEqual(appObjects)
    // The real guard is back: history cannot be changed.
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM audit_log')!.n).toBeGreaterThan(0)
    expect(() => db.run("UPDATE audit_log SET reason = 'SYNTHETIC'")).toThrow()
    db.close()
  })
})
