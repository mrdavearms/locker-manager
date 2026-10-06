import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { REPORT_IDS, type ReportRequest } from '../../src/shared/reports'
import { lockForLocker, markNeedsNewCode } from '../../src/main/repos/codes'
import { buildReport, maskCodes } from '../../src/main/reports/build'
import { reportCsv, reportXlsx } from '../../src/main/reports/export'
import { buildReportHtml } from '../../src/main/render/report'
import { allocatedDemo } from './fixtures'

const req = (id: ReportRequest['id'], over: Partial<ReportRequest> = {}): ReportRequest => ({
  id,
  group: null,
  since: null,
  includeCodes: false,
  ...over
})
const page = {
  school: 'SYNTHETIC High School',
  printedAt: new Date('2026-10-06T10:00:00Z'),
  preview: false
}

describe('reports (SPEC.md 4.9 and 5.4)', () => {
  it('builds every report without error, and only the code reports are confidential', async () => {
    const { db } = await allocatedDemo()
    for (const id of REPORT_IDS) {
      const r = buildReport(db, req(id, { since: '2020-01-01' }))
      expect(r.title.length).toBeGreaterThan(0)
      expect(r.confidential).toBe(id === 'master')
      expect(buildReportHtml(r, page)).toContain('<table>')
    }
  })
  it('group lists: each group on its own page, every current student, no codes', async () => {
    const { db } = await allocatedDemo()
    const r = buildReport(db, req('group_lists'))
    expect(r.breakBetween).toBe(true)
    const active = db.get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM student WHERE archived_at IS NULL AND active = 1 AND left_at IS NULL'
    )!.n
    expect(r.rows).toBe(active)
    expect(r.columns.some((c) => c.kind === 'code')).toBe(false)
    expect(r.sections.at(-1)!.heading).toMatch(/ZZZ|HUB/)
    const one = buildReport(db, req('group_lists', { group: '07A' }))
    expect(one.sections).toHaveLength(1)
  })
  it('master list: every code, recorded as revealed, and hidden on screen', async () => {
    const { db, assigned } = await allocatedDemo()
    const r = buildReport(db, req('master'))
    expect(r.revealedLockers).toHaveLength(assigned)
    const codes = r.sections[0]!.rows.map((x) => x.code!)
    expect(codes.every((c) => /^\d{4}$/.test(c))).toBe(true)
    const masked = maskCodes(r)
    expect(masked.sections[0]!.rows.every((x) => x.code === '••••')).toBe(true)
    const html = buildReportHtml(masked, page)
    expect(html).toContain('CONFIDENTIAL')
    expect(html).not.toContain(codes[0]!)
  })
  it('lockers by bank lists every locker, spares included', async () => {
    const { db } = await allocatedDemo()
    const r = buildReport(db, req('by_bank'))
    expect(r.rows).toBe(228)
    expect(r.sections.flatMap((s) => s.rows).some((x) => x.status!.startsWith('Spare'))).toBe(true)
  })
  it('locks to reset: a tick list, with the new code only when asked', async () => {
    const { db, ctx } = await allocatedDemo()
    const locker = db.get<{ locker_id: string }>(
      "SELECT locker_id FROM assignment WHERE status = 'current' LIMIT 1"
    )!
    markNeedsNewCode(db, ctx, lockForLocker(db, locker.locker_id)!.id)
    const r = buildReport(db, req('reset_checklist'))
    expect(r.rows).toBe(1)
    expect(r.sections[0]!.rows[0]!.todo).toBe('Reset to 0 0 0 0')
    expect(r.columns[0]!.kind).toBe('tick')
    expect(r.columns.some((c) => c.key === 'code')).toBe(false)
  })
  it('changes since a date lists what happened, oldest first', async () => {
    const { db } = await allocatedDemo()
    const r = buildReport(db, req('changes', { since: '2020-01-01' }))
    expect(r.sections[0]!.rows[0]!.what).toBe('Created the file')
    expect(buildReport(db, req('changes', { since: '2099-01-01' })).rows).toBe(0)
  })
  it('exports CSV that Excel reads, with formula-like cells made safe', () => {
    const csv = reportCsv({
      title: 'T',
      subtitle: null,
      note: null,
      columns: [
        { key: 'a', label: 'Name', width: 1 },
        { key: 't', label: 'Done', width: 1, kind: 'tick' }
      ],
      sections: [{ heading: null, rows: [{ a: '=SUM(A1)' }, { a: 'Zoë' }] }],
      sectionLabel: null,
      breakBetween: false,
      confidential: false,
      landscape: false,
      rows: 2
    })
    expect(csv.startsWith('﻿Name\r\n')).toBe(true)
    expect(csv).toContain("'=SUM(A1)")
    expect(csv).toContain('Zoë')
    expect(csv).not.toContain('Done')
  })
  it('exports Excel with the CONFIDENTIAL line and text cells', async () => {
    const { db } = await allocatedDemo()
    const r = buildReport(db, req('master'))
    const bytes = await reportXlsx(r, 'SYNTHETIC High School')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer)
    const ws = wb.worksheets[0]!
    expect(String(ws.getCell('A1').value)).toMatch(/CONFIDENTIAL/)
    expect(ws.rowCount).toBe(r.rows + 3)
  })
})
