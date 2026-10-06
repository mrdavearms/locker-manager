import { ipcMain } from 'electron'
import log from 'electron-log/main'
import { z } from 'zod'
import { channels } from '@shared/channels'
import type { ActionResult } from '@shared/ipc'
import { LetterLanguageSchema, LetterSelectionSchema, LetterTemplateSchema } from '@shared/letters'
import { EXPORT_FORMATS, ReportRequestSchema } from '@shared/reports'
import { fileSession } from './fileService'
import { revealCode } from './repos/codes'
import { recordPrintJob } from './repos/labels'
import { getSchoolProfile } from './repos/school'
import { buildReport, type BuiltReport } from './reports/build'
import { reportCsv, reportXlsx } from './reports/export'
import {
  htmlToPdf,
  overflowingLetters,
  pdfPageCount,
  printHtml,
  printReport,
  reportToPdf
} from './render/pdf'
import { prepareLetters, type PreparedLetters } from './render/prepareLetters'
import { buildReportHtml, reportDate, reportFooter } from './render/report'
import { saveOutput, stampDate } from './renderService'

// Letters and reports (SPEC.md 4.8, 4.9, 5.2, 5.4, 5.5). Every code that leaves
// the app on paper, in a PDF or in an export is recorded in the reveal log, so
// anything with codes needs the file open for editing.

const LettersJob = z.object({
  selection: LetterSelectionSchema,
  language: LetterLanguageSchema
})
const LettersCheck = LettersJob.extend({ template: LetterTemplateSchema.optional() })
const ReportJob = z.object({ request: ReportRequestSchema })
const ExportJob = ReportJob.extend({ format: z.enum(EXPORT_FORMATS) })

type Saved = ActionResult & { path?: string }

const NEEDS_EDIT =
  'Open the file for editing to print codes: every code printed or exported is recorded. You can still print lists without codes.'

function canRecord(): boolean {
  const s = fileSession().state
  return s.status === 'open' && s.mode === 'edit' && !s.conflict
}

function overflowMessage(p: PreparedLetters, ids: string[]): string {
  const names = ids
    .map((id) => p.items.find((i) => i.record.studentId === id)?.record)
    .filter((r) => r !== undefined)
    .map((r) => `${r.firstName} ${r.lastName} (${r.locker})`)
  const shown = names.slice(0, 5).join(', ')
  return `${names.length === 1 ? 'One letter runs' : `${names.length} letters run`} onto a second page: ${shown}${
    names.length > 5 ? ' and others' : ''
  }. Shorten the words or make a picture smaller in Settings, Letters. Nothing was saved.`
}

/** Builds the letters with real codes and checks every one fits its page. */
async function readyLetters(
  job: z.infer<typeof LettersJob>
): Promise<{ ok: true; p: PreparedLetters } | { ok: false; message: string }> {
  const s = fileSession()
  const p = s.read((db) => prepareLetters(db, { ...job, masked: false, preview: false }))
  if (p.items.length === 0)
    return {
      ok: false,
      message:
        p.heldBack.length > 0
          ? `No letters are ready: ${p.heldBack.length} held back until their locks are sorted out.`
          : 'There are no letters for that choice. Spare lockers never get a letter.'
    }
  if (p.items.some((i) => i.code) && !canRecord()) return { ok: false, message: NEEDS_EDIT }
  const over = await overflowingLetters(p.html)
  if (over.length > 0) return { ok: false, message: overflowMessage(p, over) }
  return { ok: true, p }
}

function recordLetters(p: PreparedLetters, to: 'pdf' | 'printer'): void {
  if (!canRecord()) return
  const lockerIds = p.items.map((i) => i.record.lockerId)
  fileSession().write(
    { action: 'letters.printed', entity: 'print_job', after: { letters: lockerIds.length, to } },
    (db, ctx) => {
      for (const i of p.items) if (i.code) revealCode(db, ctx, i.record.lockerId, 'letter')
      recordPrintJob(db, ctx, 'letters', lockerIds)
    }
  )
}

function readyReport(
  job: z.infer<typeof ReportJob>
): { ok: true; report: BuiltReport; school: string } | { ok: false; message: string } {
  const { report, school } = fileSession().read((db) => ({
    report: buildReport(db, job.request),
    school: getSchoolProfile(db).name
  }))
  if (report.revealedLockers.length > 0 && !canRecord()) return { ok: false, message: NEEDS_EDIT }
  return { ok: true, report, school }
}

function recordReport(report: BuiltReport, how: 'printed' | 'exported', to: string): void {
  if (!canRecord()) return
  fileSession().write(
    {
      action: how === 'printed' ? 'report.printed' : 'report.exported',
      entity: 'print_job',
      after: { report: report.title, rows: report.rows, to, codes: report.revealedLockers.length }
    },
    (db, ctx) => {
      for (const id of report.revealedLockers)
        revealCode(db, ctx, id, how === 'printed' ? 'report' : 'export')
      if (how === 'printed') recordPrintJob(db, ctx, 'report', report.revealedLockers)
    }
  )
}

function fileName(report: BuiltReport, ext: string): string {
  return `${report.confidential ? 'CONFIDENTIAL ' : ''}${report.title} ${stampDate()}.${ext}`
}

export function registerDocumentHandlers(): void {
  ipcMain.handle(channels.renderLettersCheck, async (_e, raw: unknown) => {
    const job = LettersCheck.parse(raw)
    const p = fileSession().read((db) =>
      prepareLetters(db, { ...job, masked: true, preview: false })
    )
    if (p.items.length === 0) return { overflow: [] as string[] }
    const ids = await overflowingLetters(p.html)
    return {
      overflow: ids.map((id) => {
        const r = p.items.find((i) => i.record.studentId === id)?.record
        return r ? `${r.firstName} ${r.lastName} (${r.locker})` : id
      })
    }
  })

  ipcMain.handle(channels.renderLettersPdf, async (_e, raw: unknown): Promise<Saved> => {
    const ready = await readyLetters(LettersJob.parse(raw))
    if (!ready.ok) return ready
    const bytes = await htmlToPdf(ready.p.html)
    const pages = await pdfPageCount(bytes)
    if (pages !== ready.p.items.length) {
      log.warn('letter page count mismatch', pages, ready.p.items.length)
      return {
        ok: false,
        message: `The PDF came out with ${pages} pages for ${ready.p.items.length} letters, so a letter must have spilled over. Nothing was saved.`
      }
    }
    const path = await saveOutput(`Locker letters ${stampDate()}.pdf`, bytes)
    if (!path) return { ok: false, cancelled: true, message: '' }
    recordLetters(ready.p, 'pdf')
    return { ok: true, path }
  })

  ipcMain.handle(channels.renderLettersPrint, async (_e, raw: unknown): Promise<ActionResult> => {
    const ready = await readyLetters(LettersJob.parse(raw))
    if (!ready.ok) return ready
    const r = await printHtml(ready.p.html, {
      widthMm: ready.p.page.width,
      heightMm: ready.p.page.height
    })
    if (!r.printed)
      return {
        ok: false,
        cancelled: r.reason === 'cancelled',
        message:
          r.reason === 'cancelled' ? '' : `Printing did not finish: ${r.reason ?? 'unknown'}.`
      }
    recordLetters(ready.p, 'printer')
    return { ok: true }
  })

  ipcMain.handle(channels.renderReportPdf, async (_e, raw: unknown): Promise<Saved> => {
    const ready = readyReport(ReportJob.parse(raw))
    if (!ready.ok) return ready
    const page = { school: ready.school, printedAt: new Date(), preview: false }
    const bytes = await reportToPdf(
      buildReportHtml(ready.report, page),
      reportFooter(ready.report, page)
    )
    const path = await saveOutput(fileName(ready.report, 'pdf'), bytes)
    if (!path) return { ok: false, cancelled: true, message: '' }
    recordReport(ready.report, 'printed', 'pdf')
    return { ok: true, path }
  })

  ipcMain.handle(channels.renderReportPrint, async (_e, raw: unknown): Promise<ActionResult> => {
    const ready = readyReport(ReportJob.parse(raw))
    if (!ready.ok) return ready
    const page = { school: ready.school, printedAt: new Date(), preview: false }
    const r = await printReport(buildReportHtml(ready.report, page), {
      landscape: ready.report.landscape,
      footer: `${ready.school} · ${ready.report.title}${ready.report.confidential ? ' · CONFIDENTIAL' : ''} · Printed ${reportDate(page.printedAt)}`
    })
    if (!r.printed)
      return {
        ok: false,
        cancelled: r.reason === 'cancelled',
        message:
          r.reason === 'cancelled' ? '' : `Printing did not finish: ${r.reason ?? 'unknown'}.`
      }
    recordReport(ready.report, 'printed', 'printer')
    return { ok: true }
  })

  ipcMain.handle(channels.renderReportExport, async (_e, raw: unknown): Promise<Saved> => {
    const job = ExportJob.parse(raw)
    const ready = readyReport(job)
    if (!ready.ok) return ready
    // Codes are only in the report when its request asked for them.
    const report = ready.report
    const path =
      job.format === 'csv'
        ? await saveOutput(fileName(report, 'csv'), reportCsv(report), {
            name: 'CSV file',
            extension: 'csv'
          })
        : await saveOutput(fileName(report, 'xlsx'), await reportXlsx(report, ready.school), {
            name: 'Excel workbook',
            extension: 'xlsx'
          })
    if (!path) return { ok: false, cancelled: true, message: '' }
    recordReport(ready.report, 'exported', job.format)
    return { ok: true, path }
  })
}
