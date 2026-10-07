import { describe, expect, it } from 'vitest'
import type { ImportOptions } from '../../src/shared/importTypes'
import { createDemoDatabase } from '../../src/main/demo/demoSchool'
import { createStudent, getStudent } from '../../src/main/repos/students'
import { analyseImport, buildStudents } from '../../src/main/import/analyse'
import { detectPreset, mapColumns } from '../../src/shared/importPresets'
import { findHeaderRow, firstDataSheet, parseFile } from '../../src/main/import/parse'
import { testContext } from './helpers'

// Every sample here is SYNTHETIC.
const OPTS: ImportOptions = { particles: 'capital', groupMap: {}, wholeSchool: false }
const HEADER = 'SUSSI ID,Import Identifier,Last Name,First Name,Gender,Campus,Form Group,House'

describe('adding a student by hand (mid-year enrolment)', () => {
  it('adds them with tidied names, the year level as a plain number and the group code', async () => {
    const db = await createDemoDatabase(testContext(), '0.10.0')
    const id = createStudent(db, testContext(), {
      externalId: ' SYN9001 ',
      firstName: 'zoe',
      lastName: "o'brien",
      preferredName: null,
      yearLevel: 'Year 7',
      groupCode: '07B'
    })
    const s = getStudent(db, id)!
    expect(s).toMatchObject({
      externalId: 'SYN9001',
      yearLevel: '7',
      groupCode: '07B',
      active: true
    })
    expect(s.firstName).toBe('Zoe')
    expect(s.lastName).toBe("O'Brien")
  })

  it('takes the year level from the group when none is given', async () => {
    const db = await createDemoDatabase(testContext(), '0.10.0')
    const id = createStudent(db, testContext(), {
      externalId: 'SYN9002',
      firstName: 'Ravi',
      lastName: 'Patel',
      preferredName: null,
      yearLevel: null,
      groupCode: '08A'
    })
    expect(getStudent(db, id)!.yearLevel).toBe('8')
  })

  it('refuses a student ID that is already in the file', async () => {
    const db = await createDemoDatabase(testContext(), '0.10.0')
    const taken = db.get<{ external_id: string }>(
      'SELECT external_id FROM student LIMIT 1'
    )!.external_id
    expect(() =>
      createStudent(db, testContext(), {
        externalId: taken,
        firstName: 'A',
        lastName: 'B',
        preferredName: null,
        yearLevel: '7',
        groupCode: null
      })
    ).toThrow(/already/)
  })

  it('a later import matches them by student ID, not as a new student', async () => {
    const db = await createDemoDatabase(testContext(), '0.10.0')
    createStudent(db, testContext(), {
      externalId: 'SYN9001',
      firstName: 'Zoe',
      lastName: "O'Brien",
      preferredName: null,
      yearLevel: '7',
      groupCode: '07B'
    })
    const f = await parseFile(
      'Year 7 SYNTHETIC.csv',
      new TextEncoder().encode([HEADER, "SYN9001,,O'BRIEN,ZOE,F,Main,07B,Red"].join('\r\n'))
    )
    const rows = f.sheets[firstDataSheet(f.sheets)]!.rows
    const headerRow = findHeaderRow(rows)
    const settings = {
      sheetIndex: firstDataSheet(f.sheets),
      headerRow,
      mapping: mapColumns(rows[headerRow] ?? [], detectPreset(rows[headerRow] ?? [])),
      yearSource: 'group' as const,
      fixedYear: null
    }
    const a = analyseImport(db, buildStudents([f], [settings], OPTS), OPTS)
    expect(a.newStudents.map((s) => s.externalId)).not.toContain('SYN9001')
    expect(a.students.map((s) => s.externalId)).toContain('SYN9001')
  })
})
