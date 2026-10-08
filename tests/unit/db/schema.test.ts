import { describe, expect, it } from 'vitest'
import { LockerDb } from '../../../src/main/db/db'
import { appendAudit, getMeta, newId } from '../../../src/main/db/context'
import {
  assertMigrationList,
  LATEST_SCHEMA_VERSION,
  migrate,
  migrations,
  schemaState
} from '../../../src/main/db/migrate'
import { createNewDatabase } from '../../../src/main/db/newFile'
import { summarise } from '../../../src/main/db/summary'
import { testContext } from '../helpers'

const ts = { $c: '2026-10-06T00:00:00Z', $by: 'Test' }

async function freshDb(): Promise<LockerDb> {
  return createNewDatabase(testContext(), {
    schoolName: 'SYNTHETIC Test School',
    appVersion: '0.1.0'
  })
}

function addLocker(
  db: LockerDb,
  number: string,
  opts: { capacity?: number; status?: string } = {}
): string {
  const area = db.get<{ id: string }>('SELECT id FROM area LIMIT 1')
  let areaId = area?.id
  if (!areaId) {
    areaId = newId()
    db.run(
      `INSERT INTO area (id, name, created_at, updated_at, updated_by) VALUES ($id, 'Area', $c, $c, $by)`,
      { $id: areaId, ...ts }
    )
    db.run(
      `INSERT INTO bank (id, area_id, name, created_at, updated_at, updated_by) VALUES ($id, $a, 'Bank', $c, $c, $by)`,
      { $id: newId(), $a: areaId, ...ts }
    )
  }
  const bank = db.get<{ id: string }>('SELECT id FROM bank LIMIT 1')
  const id = newId()
  db.run(
    `INSERT INTO locker (id, number, sort_key, bank_id, capacity, status, qr_id, created_at, updated_at, updated_by)
     VALUES ($id, $n, $n, $b, $cap, $st, $qr, $c, $c, $by)`,
    {
      $id: id,
      $n: number,
      $b: bank?.id ?? '',
      $cap: opts.capacity ?? 1,
      $st: opts.status ?? 'in_service',
      $qr: newId(),
      ...ts
    }
  )
  return id
}

function addStudent(db: LockerDb, externalId: string): string {
  const id = newId()
  db.run(
    `INSERT INTO student (id, external_id, first_name_raw, last_name_raw, first_name, last_name, created_at, updated_at, updated_by)
     VALUES ($id, $e, 'Ava', 'SYNTHETIC', 'Ava', 'Synthetic', $c, $c, $by)`,
    { $id: id, $e: externalId, ...ts }
  )
  return id
}

function assign(db: LockerDb, studentId: string, lockerId: string, status = 'current'): string {
  const year = db.get<{ id: string }>("SELECT id FROM school_year WHERE status = 'active'")
  const id = newId()
  db.run(
    `INSERT INTO assignment (id, student_id, locker_id, school_year_id, start_date, status, created_at, updated_at, updated_by)
     VALUES ($id, $s, $l, $y, '2026-10-06', $st, $c, $c, $by)`,
    { $id: id, $s: studentId, $l: lockerId, $y: year?.id ?? '', $st: status, ...ts }
  )
  return id
}

describe('migrations', () => {
  it('are numbered 1, 2, 3 with no gaps', () => {
    expect(() => assertMigrationList(migrations)).not.toThrow()
    expect(() => assertMigrationList([{ version: 2, name: 'x', sql: '' }])).toThrow()
  })

  it('bring an empty database to the newest schema, with integrity intact', async () => {
    const db = await LockerDb.create()
    expect(schemaState(db)).toEqual({ kind: 'older', from: 0, to: LATEST_SCHEMA_VERSION })
    expect(migrate(db)).toEqual({ from: 0, to: LATEST_SCHEMA_VERSION })
    expect(schemaState(db).kind).toBe('current')
    expect(db.integrityProblems()).toEqual([])
  })

  it('do nothing the second time', async () => {
    const db = await freshDb()
    expect(migrate(db)).toEqual({ from: LATEST_SCHEMA_VERSION, to: LATEST_SCHEMA_VERSION })
  })

  it('recognise a file from a newer version and refuse to migrate it', async () => {
    const db = await freshDb()
    db.userVersion = LATEST_SCHEMA_VERSION + 3
    expect(schemaState(db)).toEqual({
      kind: 'newer',
      fileVersion: LATEST_SCHEMA_VERSION + 3,
      appVersion: LATEST_SCHEMA_VERSION
    })
    expect(() => migrate(db)).toThrow(/newer version/)
  })

  it('leave the database at the last good version when one fails', async () => {
    const db = await LockerDb.create()
    const list = [
      ...migrations,
      {
        version: LATEST_SCHEMA_VERSION + 1,
        name: 'bad',
        sql: 'CREATE TABLE ok_table (x); THIS IS NOT SQL;'
      }
    ]
    expect(() => migrate(db, list)).toThrow()
    expect(db.userVersion).toBe(LATEST_SCHEMA_VERSION)
    expect(db.all("SELECT name FROM sqlite_master WHERE name = 'ok_table'")).toHaveLength(0)
  })
})

describe('a new data file', () => {
  it('has a school, one active year, an id and a history entry', async () => {
    const db = await freshDb()
    const s = summarise(db)
    expect(s.schoolName).toBe('SYNTHETIC Test School')
    expect(s.demo).toBe(false)
    expect(s.fileId).toMatch(/^[0-9a-f-]{36}$/)
    expect(s.lastChange?.action).toBe('file.created')
    expect(db.all("SELECT * FROM school_year WHERE status = 'active'")).toHaveLength(1)
    expect(getMeta(db, 'created_with_app_version')).toBe('0.1.0')
  })

  it('refuses a blank school name', async () => {
    await expect(
      createNewDatabase(testContext(), { schoolName: '   ', appVersion: '0.1.0' })
    ).rejects.toThrow(/name/)
  })

  it('survives export and reopen byte for byte', async () => {
    const db = await freshDb()
    const bytes = db.export()
    const again = await LockerDb.fromBytes(bytes)
    expect(summarise(again)).toEqual(summarise(db))
  })
})

describe('sql.js export trap', () => {
  it('keeps foreign keys switched on after export', async () => {
    const db = await freshDb()
    db.export()
    expect(db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')?.foreign_keys).toBe(1)
    expect(() =>
      db.run(
        `INSERT INTO bank (id, area_id, name, created_at, updated_at, updated_by) VALUES ('b', 'no-such-area', 'B', $c, $c, $by)`,
        ts
      )
    ).toThrow(/FOREIGN KEY/)
  })

  it('refuses to export in the middle of a transaction', async () => {
    const db = await freshDb()
    expect(() => db.transaction(() => db.export())).toThrow(/transaction/)
  })
})

describe('the history', () => {
  it('cannot be edited or deleted', async () => {
    const db = await freshDb()
    appendAudit(db, testContext(), { action: 'test', entity: 'school' })
    expect(() => db.run("UPDATE audit_log SET operator = 'someone else'")).toThrow(
      /cannot be changed/
    )
    expect(() => db.run('DELETE FROM audit_log')).toThrow(/cannot be deleted/)
  })
})

describe('assignment rules in the database (SPEC.md 3.6)', () => {
  it('a locker cannot hold more current assignments than its capacity', async () => {
    const db = await freshDb()
    const locker = addLocker(db, '1')
    assign(db, addStudent(db, 'S1'), locker)
    expect(() => assign(db, addStudent(db, 'S2'), locker)).toThrow(/already full/)
  })

  it('a shared locker takes two', async () => {
    const db = await freshDb()
    const locker = addLocker(db, '1', { capacity: 2 })
    assign(db, addStudent(db, 'S1'), locker)
    assign(db, addStudent(db, 'S2'), locker)
    expect(() => assign(db, addStudent(db, 'S3'), locker)).toThrow(/already full/)
  })

  it('a student cannot hold two current lockers unless settings allow it', async () => {
    const db = await freshDb()
    const student = addStudent(db, 'S1')
    assign(db, student, addLocker(db, '1'))
    expect(() => assign(db, student, addLocker(db, '2'))).toThrow(/already has a locker/)
    db.run(
      `INSERT INTO settings (key, value, created_at, updated_at, updated_by) VALUES ('assignments.allowMoreThanOnePerStudent', 'true', $c, $c, $by)`,
      ts
    )
    expect(() => assign(db, student, addLocker(db, '3'))).not.toThrow()
  })

  it('an ended assignment frees the locker', async () => {
    const db = await freshDb()
    const locker = addLocker(db, '1')
    const a = assign(db, addStudent(db, 'S1'), locker)
    db.run("UPDATE assignment SET status = 'ended', end_reason = 'left_school' WHERE id = $id", {
      $id: a
    })
    expect(() => assign(db, addStudent(db, 'S2'), locker)).not.toThrow()
  })

  it('an out-of-service or reserved locker cannot take a new assignment', async () => {
    const db = await freshDb()
    expect(() =>
      assign(db, addStudent(db, 'S1'), addLocker(db, '1', { status: 'out_of_service' }))
    ).toThrow(/out of service/)
    expect(() =>
      assign(db, addStudent(db, 'S2'), addLocker(db, '2', { status: 'reserved' }))
    ).toThrow(/out of service/)
  })

  it('moving a current assignment into a full locker is refused', async () => {
    const db = await freshDb()
    const l1 = addLocker(db, '1')
    const l2 = addLocker(db, '2')
    assign(db, addStudent(db, 'S1'), l1)
    const a2 = assign(db, addStudent(db, 'S2'), l2)
    expect(() =>
      db.run('UPDATE assignment SET locker_id = $l WHERE id = $id', { $l: l1, $id: a2 })
    ).toThrow(/already full/)
  })
})

describe('locker numbers (SPEC.md section 15, item 1)', () => {
  it('cannot be typed over', async () => {
    const db = await freshDb()
    const id = addLocker(db, '102')
    expect(() => db.run("UPDATE locker SET number = '113' WHERE id = $id", { $id: id })).toThrow(
      /Renumber/
    )
  })

  it('cannot be listed twice', async () => {
    const db = await freshDb()
    addLocker(db, '102')
    expect(() => addLocker(db, '102')).toThrow(/UNIQUE/)
  })

  it('can change only inside the Renumber tool', async () => {
    const db = await freshDb()
    const id = addLocker(db, '102')
    db.transaction(() => {
      db.run("INSERT INTO meta (key, value) VALUES ('renumber_in_progress', '1')")
      db.run("UPDATE locker SET number = '113' WHERE id = $id", { $id: id })
      db.run("DELETE FROM meta WHERE key = 'renumber_in_progress'")
    })
    expect(
      db.get<{ number: string }>('SELECT number FROM locker WHERE id = $id', { $id: id })?.number
    ).toBe('113')
  })
})

describe('lock code status', () => {
  it('has a real state for "on 0 0 0 0 with no code yet" (SPEC.md section 15, item 3)', async () => {
    const db = await freshDb()
    expect(() =>
      db.run(
        `INSERT INTO lock (id, type, code_status, created_at, updated_at, updated_by) VALUES ('k', 'combination_builtin', 'reset_no_code', $c, $c, $by)`,
        ts
      )
    ).not.toThrow()
    expect(() =>
      db.run(
        `INSERT INTO lock (id, type, code_status, created_at, updated_at, updated_by) VALUES ('k2', 'combination_builtin', '0000', $c, $c, $by)`,
        ts
      )
    ).toThrow(/CHECK/)
  })
})

describe('indexes for large schools', () => {
  it('finding a locker’s waiting code uses an index, not a read of every year’s codes', async () => {
    const db = await freshDb()
    const plan = db
      .all<{ detail: string }>(
        `EXPLAIN QUERY PLAN SELECT e.id, e.code_cipher FROM code_set_entry e JOIN code_set s ON s.id = e.code_set_id
          WHERE s.purpose = 'year' AND s.school_year_id = 'y' AND e.locker_id = 'l' AND e.status = 'available'
          LIMIT 1`
      )
      .map((r) => r.detail)
      .join('\n')
    expect(plan).toMatch(/code_set_entry_locker/)
  })
})
