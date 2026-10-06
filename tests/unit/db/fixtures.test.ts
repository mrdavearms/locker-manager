import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LockerDb } from '../../../src/main/db/db'
import { LATEST_SCHEMA_VERSION, migrate, schemaState } from '../../../src/main/db/migrate'
import { summarise } from '../../../src/main/db/summary'
import { createDemoDatabase } from '../../../src/main/demo/demoSchool'
import { testContext } from '../helpers'

// SPEC.md 6.6 and 12: migrations are tested on a fixture of every earlier schema.
// tests/fixtures/schema holds one SYNTHETIC data file per released schema version.
// When a migration is added, the fixture for the version before it already exists;
// this test writes the fixture for the newest version if it is missing, so commit it.

const DIR = join('tests', 'fixtures', 'schema')
const fixtureName = (v: number): string => `v${v}-SYNTHETIC.lockers`

describe('schema fixtures', () => {
  it('include the newest schema version', async () => {
    const path = join(DIR, fixtureName(LATEST_SCHEMA_VERSION))
    if (!existsSync(path)) {
      const db = await createDemoDatabase(testContext(), 'fixture')
      writeFileSync(path, db.export())
      db.close()
    }
    expect(existsSync(path)).toBe(true)
  })

  const files = existsSync(DIR)
    ? readdirSync(DIR).filter((f) => /^v\d+-SYNTHETIC\.lockers$/.test(f))
    : []
  it.each(files)('%s opens, migrates to the newest schema and keeps its data', async (file) => {
    const db = await LockerDb.fromBytes(new Uint8Array(readFileSync(join(DIR, file))))
    const before = summarise(db)
    expect(db.integrityProblems()).toEqual([])
    expect(schemaState(db).kind).not.toBe('newer')
    migrate(db)
    expect(db.userVersion).toBe(LATEST_SCHEMA_VERSION)
    const after = summarise(db)
    expect(after.counts.students).toBe(before.counts.students)
    expect(after.counts.lockers).toBe(before.counts.lockers)
    expect(after.schoolName).toBe(before.schoolName)
    expect(db.foreignKeyProblems()).toBe(0)
  })
})
