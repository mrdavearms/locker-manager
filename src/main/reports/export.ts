import ExcelJS from 'exceljs'
import Papa from 'papaparse'
import type { ReportData } from '@shared/reports'

// Every list can be exported (SPEC.md 5.5). Tick and signature columns are left
// out; a report with sections gets a first column naming the section.

function table(report: ReportData): { header: string[]; rows: string[][] } {
  const cols = report.columns.filter((c) => c.kind !== 'tick' && c.kind !== 'blank')
  const withSection = report.sections.length > 1 || report.sections.some((s) => s.heading)
  const header = [
    ...(withSection ? [report.sectionLabel ?? 'Section'] : []),
    ...cols.map((c) => c.label)
  ]
  const rows: string[][] = []
  for (const s of report.sections)
    for (const r of s.rows)
      rows.push([...(withSection ? [s.heading ?? ''] : []), ...cols.map((c) => r[c.key] ?? '')])
  return { header, rows }
}

/** Cells that start like a formula are made plain text, so a spreadsheet never runs them. */
function safe(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
}

export function reportCsv(report: ReportData): string {
  const { header, rows } = table(report)
  // A byte order mark so Excel opens names with accents correctly.
  return `\uFEFF${Papa.unparse([header, ...rows.map((r) => r.map(safe))], { newline: '\r\n' })}`
}

export async function reportXlsx(report: ReportData, school: string): Promise<Uint8Array> {
  const { header, rows } = table(report)
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Locker Manager'
  const ws = wb.addWorksheet(report.title.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '))
  let first = 1
  if (report.confidential) {
    ws.addRow(['CONFIDENTIAL: contains lock codes'])
    ws.getRow(1).font = { bold: true, color: { argb: 'FFB00020' } }
    first++
  }
  ws.addRow([`${school}: ${report.title}${report.subtitle ? ` (${report.subtitle})` : ''}`])
  ws.getRow(first).font = { bold: true, size: 13 }
  ws.addRow(header)
  const headRow = ws.getRow(first + 1)
  headRow.font = { bold: true }
  headRow.border = { bottom: { style: 'thin' } }
  for (const r of rows) ws.addRow(r)
  ws.views = [{ state: 'frozen', ySplit: first + 1 }]
  header.forEach((h, i) => {
    const longest = Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length))
    ws.getColumn(i + 1).width = Math.min(50, Math.max(8, longest + 2))
  })
  // Text cells stay text: locker numbers like "007" keep their zeros.
  ws.eachRow((row) => row.eachCell((c) => (c.numFmt = '@')))
  return new Uint8Array(await wb.xlsx.writeBuffer())
}
