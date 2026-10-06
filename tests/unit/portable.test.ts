import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { codeKey, decryptCode } from '../../src/main/codes/cipher'
import { getMeta } from '../../src/main/db/context'
import { LATEST_SCHEMA_VERSION } from '../../src/main/db/migrate'
import { summarise } from '../../src/main/db/summary'
import { exportWorkbook, importWorkbook } from '../../src/main/portable/workbook'
import { addImage } from '../../src/main/repos/letters'
import { setLogo } from '../../src/main/repos/school'
import { allocatedDemo } from './fixtures'
import { testContext } from './helpers'

const info = (includeCodes: boolean) => ({
  operator: 'Test Operator',
  appVersion: '0.6.0',
  includeCodes,
  now: new Date('2026-10-06T10:00:00Z')
})

function codesByLocker(db: Awaited<ReturnType<typeof allocatedDemo>>['db']): Map<string, string> {
  const key = codeKey(db)
  return new Map(
    db
      .all<{ number: string; code_cipher: Uint8Array }>(
        'SELECT l.number, k.code_cipher FROM lock k JOIN locker l ON l.id = k.locker_id WHERE k.code_cipher IS NOT NULL'
      )
      .map((r) => [r.number, decryptCode(key, r.code_cipher)!])
  )
}

describe('portable export (SPEC.md 5.5)', () => {
  it('round-trips the whole file with codes, pictures and history', async () => {
    const { db, ctx } = await allocatedDemo()
    const logo = new Uint8Array(70_000).map((_, i) => i % 251)
    setLogo(db, ctx, 'colour', logo, 'image/png')
    addImage(db, ctx, { name: 'steps.png', mime: 'image/png', bytes: logo, width: 10, height: 5 })
    const before = summarise(db)
    const codes = codesByLocker(db)
    const audit = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM audit_log')!.n

    const bytes = await exportWorkbook(db, info(true))
    const back = await importWorkbook(bytes, testContext())
    const db2 = back.db
    expect(back.codesIncluded).toBe(true)
    expect(db2.userVersion).toBe(LATEST_SCHEMA_VERSION)
    const after = summarise(db2)
    // One more history line: the rebuild itself is recorded.
    expect(after.counts).toEqual({
      ...before.counts,
      historyEntries: before.counts.historyEntries + 1
    })
    expect(after.schoolName).toBe(before.schoolName)
    expect(codesByLocker(db2)).toEqual(codes)
    expect(getMeta(db2, 'file_id')).not.toBe(getMeta(db, 'file_id'))
    expect(getMeta(db2, 'code_key_v1')).not.toBe(getMeta(db, 'code_key_v1'))
    expect(db2.get<{ n: number }>('SELECT COUNT(*) AS n FROM audit_log')!.n).toBe(audit + 1)
    const logo2 = db2.get<{ logo: Uint8Array }>('SELECT logo FROM school')!.logo
    expect(Buffer.from(logo2).equals(Buffer.from(logo))).toBe(true)
    expect(db2.get<{ n: number }>('SELECT COUNT(*) AS n FROM image')!.n).toBe(1)
    expect(db2.integrityProblems()).toEqual([])
    expect(db2.foreignKeyProblems()).toBe(0)
  })

  it('leaves codes out unless asked, and then marks the locks as needing new codes', async () => {
    const { db } = await allocatedDemo()
    const bytes = await exportWorkbook(db, info(false))
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer)
    expect(wb.getWorksheet('Lockers')!.getRow(1).values).not.toContain('Code')
    const back = await importWorkbook(bytes, testContext())
    expect(codesByLocker(back.db).size).toBe(0)
    expect(
      back.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM lock WHERE code_status = 'set'")!.n
    ).toBe(0)
  })

  it('refuses a workbook that is not an export', async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Sheet1').addRow(['Name'])
    const bytes = new Uint8Array(await wb.xlsx.writeBuffer())
    await expect(importWorkbook(bytes, testContext())).rejects.toThrow(/not a Locker Manager/)
    await expect(importWorkbook(new Uint8Array([1, 2, 3]), testContext())).rejects.toThrow(
      /could not be read/
    )
  })
})
