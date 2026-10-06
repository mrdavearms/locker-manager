import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import type { FileSettings, ImportOptions } from '../../src/shared/importTypes'
import { createNewDatabase } from '../../src/main/db/newFile'
import { decodeText } from '../../src/main/import/decode'
import {
  defaultGroupDisplay,
  normaliseYearLevel,
  yearFromFileName,
  yearFromGroup
} from '../../src/main/import/groups'
import { needsCaseFix, toNameCase } from '../../src/main/import/nameCase'
import { detectPreset, mapColumns, PRESETS } from '../../src/shared/importPresets'
import {
  findHeaderRow,
  firstDataSheet,
  parseFile,
  parsePasted,
  type ParsedFile
} from '../../src/main/import/parse'
import { analyseImport, buildStudents } from '../../src/main/import/analyse'
import { applyImport } from '../../src/main/import/apply'
import { testContext } from './helpers'

// Every sample here is SYNTHETIC.
const COMPASS_HEADER =
  'SUSSI ID,Import Identifier,Last Name,First Name,Gender,Campus,Form Group,House'
const compassCsv = (rows: string[]): string => [COMPASS_HEADER, ...rows].join('\r\n')
const enc = (s: string): Uint8Array => new TextEncoder().encode(s)
const OPTS: ImportOptions = { particles: 'capital', groupMap: {}, wholeSchool: false }

function settingsFor(f: ParsedFile, extra: Partial<FileSettings> = {}): FileSettings {
  const sheetIndex = firstDataSheet(f.sheets)
  const rows = f.sheets[sheetIndex]!.rows
  const headerRow = findHeaderRow(rows)
  const preset = detectPreset(rows[headerRow] ?? [])
  return {
    sheetIndex,
    headerRow,
    mapping: mapColumns(rows[headerRow] ?? [], preset),
    yearSource: 'group',
    fixedYear: null,
    ...extra
  }
}

describe('decoding (SPEC.md 12)', () => {
  it('reads UTF-8 with a byte-order mark', () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...enc('Zoë')]))).toEqual({
      text: 'Zoë',
      encoding: 'utf-8'
    })
  })
  it('reads Windows-1252 (Excel on Windows), keeping accents', () => {
    expect(decodeText(new Uint8Array([0x5a, 0x6f, 0xeb, 0x20, 0x92]))).toEqual({
      text: 'Zoë ’',
      encoding: 'windows-1252'
    })
  })
  it('reads UTF-16 with a byte-order mark', () => {
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x62, 0x00])).text).toBe('Ab')
  })
})

describe('parsing', () => {
  it('reads semicolon-separated files', async () => {
    const f = await parseFile(
      'students.csv',
      enc('SUSSI ID;Last Name;First Name;Form Group\nSYN0001;NGUYEN;Ava;07A')
    )
    expect(f.sheets[0]!.rows[1]).toEqual(['SYN0001', 'NGUYEN', 'Ava', '07A'])
  })
  it('reads a table pasted from Excel (tab-separated)', () => {
    expect(parsePasted('SUSSI ID\tLast Name\nSYN0001\tKELLY').sheets[0]!.rows).toEqual([
      ['SUSSI ID', 'Last Name'],
      ['SYN0001', 'KELLY']
    ])
  })
  it('reads XLSX, keeping IDs with leading zeros that were stored as text', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Year 7')
    ws.addRow(['Student ID', 'Surname', 'First name', 'Homeroom'])
    ws.addRow(['000123', "O'BRIEN", 'Liam', '07B'])
    const bytes = new Uint8Array(await wb.xlsx.writeBuffer())
    const f = await parseFile('SYNTHETIC.xlsx', bytes)
    expect(f.sheets[0]!.rows[1]).toEqual(['000123', "O'BRIEN", 'Liam', '07B'])
  })
  it('reads XLS and ODS through SheetJS', async () => {
    for (const bookType of ['xls', 'ods'] as const) {
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([
          ['Student ID', 'Surname'],
          ['SYN0009', 'TRAN']
        ]),
        'Sheet1'
      )
      const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType }) as ArrayBuffer)
      const f = await parseFile(`SYNTHETIC.${bookType}`, bytes)
      expect(f.sheets[0]!.rows).toEqual([
        ['Student ID', 'Surname'],
        ['SYN0009', 'TRAN']
      ])
    }
  })
  it('refuses a file type it cannot read, plainly', async () => {
    await expect(parseFile('photo.jpg', new Uint8Array([1, 2, 3]))).rejects.toThrow(
      /not a file Locker Manager can read/
    )
  })
  it('finds the header row when it is not row 1', () => {
    const rows = [
      ['Student Year Level Export'],
      ['Generated 2 Oct 2026'],
      [],
      COMPASS_HEADER.split(','),
      ['SYN0001', 'X', 'KELLY']
    ]
    expect(findHeaderRow(rows)).toBe(3)
  })
})

describe('presets (SPEC.md 4.2 step 3)', () => {
  it('recognises Compass by its headers and maps every column', () => {
    const headers = COMPASS_HEADER.split(',')
    const p = detectPreset(headers)
    expect(p.id).toBe('compass')
    expect(mapColumns(headers, p)).toEqual({
      externalId: 0,
      lastName: 2,
      firstName: 3,
      gender: 4,
      group: 6,
      house: 7
    })
  })
  it.each(PRESETS.filter((p) => p.id !== 'generic').map((p) => [p.id, p] as const))(
    'maps a synthetic %s export to ID and names',
    (_id, p) => {
      const headers = [
        ...p.signature,
        ...(p.aliases.firstName ?? []).slice(0, 1),
        ...(p.aliases.lastName ?? []).slice(0, 1)
      ]
      const unique = [...new Set(headers)]
      expect(detectPreset(unique).id).toBe(p.id)
      const map = mapColumns(unique, p)
      expect(map.firstName).toBeDefined()
      expect(map.lastName).toBeDefined()
    }
  )
  it('falls back to matching columns by name', () => {
    const headers = ['Given name', 'Family name', 'Student number', 'Year', 'Roll class']
    expect(detectPreset(headers).id).toBe('sentral')
    expect(
      mapColumns(
        headers,
        PRESETS.find((p) => p.id === 'generic')!
      )
    ).toMatchObject({ firstName: 0, lastName: 1, externalId: 2, yearLevel: 3, group: 4 })
  })
})

describe('name case (SPEC.md section 15, item 4)', () => {
  const sur = (s: string, particles: 'lower' | 'capital' = 'capital') =>
    toNameCase(s, { particles, isSurname: true })
  it("fixes capitals, Mc, O' and hyphens by rule", () => {
    expect(sur('NGUYEN').value).toBe('Nguyen')
    expect(sur('MCNAIR').value).toBe('McNair')
    expect(sur("O'BRIEN").value).toBe("O'Brien")
    expect(sur('O’SULLIVAN').value).toBe('O’Sullivan')
    expect(sur('SMITH-JONES')).toEqual({ value: 'Smith-Jones', flags: [] })
    expect(sur("D'SOUZA").value).toBe("D'Souza")
  })
  it('does not guess Mac, and flags it', () => {
    expect(sur('MACDONALD')).toEqual({ value: 'Macdonald', flags: ['mac'] })
  })
  it("flags particles and follows the school's choice", () => {
    expect(sur('DE LA RUE')).toEqual({ value: 'De La Rue', flags: ['particle'] })
    expect(sur('VAN BERGEN', 'lower')).toEqual({ value: 'van Bergen', flags: ['particle'] })
  })
  it('flags two-word surnames for a human check', () => {
    expect(sur('WICKRAMASINGHE ARACHCHIGE')).toEqual({
      value: 'Wickramasinghe Arachchige',
      flags: ['two_word']
    })
  })
  it('keeps accents and leaves a name typed in mixed case alone', () => {
    expect(sur('ÉLODIE-RENÉ').value).toBe('Élodie-René')
    expect(sur('MacKay')).toEqual({ value: 'MacKay', flags: [] })
    expect(needsCaseFix('McNair')).toBe(false)
    expect(needsCaseFix('KELLY')).toBe(true)
  })
})

describe('groups and year levels', () => {
  it('turn export codes into display groups and year levels', () => {
    expect(defaultGroupDisplay('07A')).toBe('7A')
    expect(defaultGroupDisplay('HUB')).toBe('HUB')
    expect(yearFromGroup('07A')).toBe('7')
    expect(yearFromGroup('12B')).toBe('12')
    expect(yearFromGroup('ZZZ')).toBeNull()
    expect(normaliseYearLevel('Year 07')).toBe('7')
    expect(normaliseYearLevel('Prep')).toBe('Prep')
    expect(yearFromFileName('Student Year Level Year 8 Export - 2026-10-02_1015AM.csv')).toBe('8')
  })
})

async function compassFile(name: string, rows: string[]): Promise<ParsedFile> {
  return parseFile(name, enc(compassCsv(rows)))
}

describe('building and checking students (SPEC.md 4.2 step 5)', () => {
  it('skips totals and blank IDs, refuses duplicates within and across files, and spots the wrong year', async () => {
    const y7 = await compassFile('Year 7 SYNTHETIC.csv', [
      'SYN0001,I1,NGUYEN,Ava,F,Main,07A,Red',
      'SYN0002,I2,MCNAIR,Leo,M,Main,07A,Blue',
      'SYN0002,I2,MCNAIR,Leo,M,Main,07A,Blue',
      'SYN0003,I3,KELLY,Mia,F,Main,08C,Gold',
      ',,,,,,,',
      ',,,Smith,,,,',
      'Total: 4,,,,,,,'
    ])
    const y8 = await compassFile('Year 8 SYNTHETIC.csv', [
      'SYN0001,I1,NGUYEN,Ava,F,Main,08A,Red',
      'SYN0010,I10,TAYLOR,Ruby,F,Main,08B,Red'
    ])
    const built = buildStudents(
      [y7, y8],
      [
        settingsFor(y7, { yearSource: 'fixed', fixedYear: '7' }),
        settingsFor(y8, { yearSource: 'fixed', fixedYear: '8' })
      ],
      OPTS
    )
    expect(built.students.map((s) => s.externalId)).toEqual([
      'SYN0001',
      'SYN0002',
      'SYN0003',
      'SYN0010'
    ])
    const kinds = built.problems.map((p) => p.kind)
    expect(kinds).toContain('duplicate_in_file')
    expect(kinds).toContain('duplicate_across_files')
    expect(kinds).toContain('wrong_year_level')
    expect(kinds).toContain('footer_row')
    expect(kinds).toContain('blank_id')
    expect(built.problems.find((p) => p.kind === 'wrong_year_level')?.message).toMatch(
      /Mia Kelly \(SYN0003\) looks like year 8/
    )
    expect(built.students[1]).toMatchObject({
      lastName: 'McNair',
      lastNameRaw: 'MCNAIR',
      groupDisplay: '7A'
    })
  })

  it('keeps IDs with leading zeros as text', async () => {
    const f = await parseFile(
      'SYNTHETIC.csv',
      enc('Student ID,Surname,First name,Homeroom\n000123,TRAN,An,07A')
    )
    const built = buildStudents([f], [settingsFor(f)], OPTS)
    expect(built.students[0]?.externalId).toBe('000123')
  })
})

describe('comparing with the data file and applying (SPEC.md 4.2 steps 6 and 7)', () => {
  it('lists new, changed, possible leavers (only in the year levels imported) and unchanged; applies only what is ticked', async () => {
    const db = await createNewDatabase(testContext(), {
      schoolName: 'SYNTHETIC',
      appVersion: '0.3.0'
    })
    const ctx = testContext()
    const first = await compassFile('Year 7.csv', [
      'SYN0001,I,NGUYEN,Ava,F,M,07A,R',
      'SYN0002,I,KELLY,Leo,M,M,07B,R',
      'SYN0003,I,SMITH,Mia,F,M,07C,R'
    ])
    const y8 = await compassFile('Year 8.csv', ['SYN0100,I,TRAN,An,M,M,08A,R'])
    const b1 = buildStudents([first, y8], [settingsFor(first), settingsFor(y8)], OPTS)
    const a1 = analyseImport(db, b1, OPTS)
    expect(a1.newStudents).toHaveLength(4)
    applyImport(
      db,
      ctx,
      a1,
      { add: a1.newStudents.map((s) => s.externalId), update: [], markMissing: [] },
      { files: ['Year 7.csv', 'Year 8.csv'], profile: 'compass' }
    )

    // Next import: Year 7 only. Leo changed Homeroom, Mia left, Zara is new. Year 8 is not touched.
    db.run(
      "UPDATE student SET first_name = 'Ava-Rose', name_override = 1 WHERE external_id = 'SYN0001'"
    )
    const again = await compassFile('Year 7.csv', [
      'SYN0001,I,NGUYEN,Ava,F,M,07A,R',
      'SYN0002,I,KELLY,Leo,M,M,07D,R',
      'SYN0004,I,ABBOTT,Zara,F,M,07A,R'
    ])
    const a2 = analyseImport(db, buildStudents([again], [settingsFor(again)], OPTS), OPTS)
    expect(a2.newStudents.map((s) => s.externalId)).toEqual(['SYN0004'])
    expect(a2.changed).toEqual([
      expect.objectContaining({
        externalId: 'SYN0002',
        changes: [{ field: 'group', from: '07B', to: '07D' }]
      })
    ])
    expect(a2.leavers.map((l) => l.externalId)).toEqual(['SYN0003'])
    expect(a2.unchanged).toBe(1)

    const r = applyImport(
      db,
      ctx,
      a2,
      { add: ['SYN0004'], update: [], markMissing: [a2.leavers[0]!.studentId] },
      { files: ['Year 7.csv'], profile: 'compass' }
    )
    expect(r).toEqual({ added: 1, updated: 0, markedMissing: 1, seen: 3 })
    const row = (id: string) =>
      db.get<{
        group_code: string
        first_name: string
        not_in_import_since: string | null
        active: number
      }>('SELECT * FROM student WHERE external_id = $e', { $e: id })
    expect(row('SYN0002')?.group_code).toBe('07B') // not ticked, so not changed
    expect(row('SYN0003')).toMatchObject({ active: 1 }) // never removed by an import
    expect(row('SYN0003')?.not_in_import_since).not.toBeNull()
    expect(row('SYN0001')?.first_name).toBe('Ava-Rose') // operator correction survives
    expect(row('SYN0100')?.not_in_import_since).toBeNull() // Year 8 untouched
  })

  it('treats the whole school as covered when told to', async () => {
    const db = await createNewDatabase(testContext(), {
      schoolName: 'SYNTHETIC',
      appVersion: '0.3.0'
    })
    const f = await compassFile('All.csv', [
      'SYN0001,I,NGUYEN,Ava,F,M,07A,R',
      'SYN0100,I,TRAN,An,M,M,08A,R'
    ])
    const a = analyseImport(db, buildStudents([f], [settingsFor(f)], OPTS), OPTS)
    applyImport(
      db,
      testContext(),
      a,
      { add: ['SYN0001', 'SYN0100'], update: [], markMissing: [] },
      { files: ['All.csv'], profile: 'compass' }
    )
    const only7 = await compassFile('Y7.csv', ['SYN0001,I,NGUYEN,Ava,F,M,07A,R'])
    const whole = { ...OPTS, wholeSchool: true }
    expect(
      analyseImport(db, buildStudents([only7], [settingsFor(only7)], whole), whole).leavers.map(
        (l) => l.externalId
      )
    ).toEqual(['SYN0100'])
  })
})
