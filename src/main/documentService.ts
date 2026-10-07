import { ipcMain } from 'electron'
import log from 'electron-log/main'
import { z } from 'zod'
import { channels } from '@shared/channels'
import type { ActionResult } from '@shared/ipc'
import { LetterLanguageSchema, LetterSelectionSchema, LetterTemplateSchema } from '@shared/letters'
import { EXPORT_FORMATS, ReportRequestSchema } from '@shared/reports'
import { whileBusy } from './busy'
import { fileSession } from './fileService'
import { codesLocked } from './privacy'
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
import { pickOutputPath, stampDate, writeOutput } from './renderService'

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
  if (p.items.some((i) => i.code)) {
    if (!canRecord()) return { ok: false, message: NEEDS_EDIT }
    const locked = s.read((db) => codesLocked(db))
    if (locked) return { ok: false, message: locked }
  }
  const over = await overflowingLetters(p.html)
  if (over.length > 0) return { ok: false, message: overflowMessage(p, over) }
  return { ok: true, p }
}

/**
 * Records the letters (and every code in them) BEFORE the file is written, so no
 * code ever leaves the app unrecorded. Returns why it could not, or null.
 */
function recordLetters(p: PreparedLetters, to: 'pdf' | 'printer'): string | null {
  const hasCodes = p.items.some((i) => i.code)
  const why = recordBlocked(hasCodes)
  if (why !== undefined) return why
  const lockerIds = p.items.map((i) => i.record.lockerId)
  try {
    fileSession().write(
      { action: 'letters.printed', entity: 'print_job', after: { letters: lockerIds.length, to } },
      (db, ctx) => {
        for (const i of p.items) if (i.code) revealCode(db, ctx, i.record.lockerId, 'letter')
        recordPrintJob(db, ctx, 'letters', lockerIds)
      }
    )
  } catch (error) {
    if (hasCodes) return error instanceof Error ? error.message : String(error)
  }
  return null
}

/** undefined: go ahead and record. null: nothing to record. A string: refuse. */
function recordBlocked(hasCodes: boolean): string | null | undefined {
  if (!canRecord()) return hasCodes ? NEEDS_EDIT : null
  if (hasCodes) {
    const locked = fileSession().read((db) => codesLocked(db))
    if (locked) return locked
  }
  return undefined
}

function readyReport(
  job: z.infer<typeof ReportJob>
): { ok: true; report: BuiltReport; school: string } | { ok: false; message: string } {
  const { report, school } = fileSession().read((db) => ({
    report: buildReport(db, job.request),
    school: getSchoolProfile(db).name
  }))
  if (report.revealedLockers.length > 0) {
    if (!canRecord()) return { ok: false, message: NEEDS_EDIT }
    const locked = fileSession().read((db) => codesLocked(db))
    if (locked) return { ok: false, message: locked }
  }
  return { ok: true, report, school }
}

function recordReport(report: BuiltReport, how: 'printed' | 'exported', to: string): string | null {
  const hasCodes = report.revealedLockers.length > 0
  const why = recordBlocked(hasCodes)
  if (why !== undefined) return why
  try {
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
  } catch (error) {
    if (hasCodes) return error instanceof Error ? error.message : String(error)
  }
  return null
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
    return await whileBusy('printing', async () => {
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
      const path = await pickOutputPath(`Locker letters ${stampDate()}.pdf`)
      if (!path) return { ok: false, cancelled: true, message: '' }
      const refused = recordLetters(ready.p, 'pdf')
      if (refused) return { ok: false, message: `${refused} Nothing was saved.` }
      await writeOutput(path, bytes)
      return { ok: true, path }
    })
  })

  ipcMain.handle(channels.renderLettersPrint, async (_e, raw: unknown): Promise<ActionResult> => {
    return await whileBusy('printing', async () => {
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
      const notRecorded = recordLetters(ready.p, 'printer')
      if (notRecorded) log.warn('printed letters could not be recorded', notRecorded)
      return { ok: true }
    })
  })

  ipcMain.handle(channels.renderReportPdf, async (_e, raw: unknown): Promise<Saved> => {
    return await whileBusy('printing', async () => {
      const ready = readyReport(ReportJob.parse(raw))
      if (!ready.ok) return ready
      const page = { school: ready.school, printedAt: new Date(), preview: false }
      const bytes = await reportToPdf(
        buildReportHtml(ready.report, page),
        reportFooter(ready.report, page)
      )
      const path = await pickOutputPath(fileName(ready.report, 'pdf'))
      if (!path) return { ok: false, cancelled: true, message: '' }
      const refused = recordReport(ready.report, 'printed', 'pdf')
      if (refused) return { ok: false, message: `${refused} Nothing was saved.` }
      await writeOutput(path, bytes)
      return { ok: true, path }
    })
  })

  ipcMain.handle(channels.renderReportPrint, async (_e, raw: unknown): Promise<ActionResult> => {
    return await whileBusy('printing', async () => {
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
      const notRecorded = recordReport(ready.report, 'printed', 'printer')
      if (notRecorded) log.warn('printed report could not be recorded', notRecorded)
      return { ok: true }
    })
  })

  ipcMain.handle(channels.renderReportExport, async (_e, raw: unknown): Promise<Saved> => {
    return await whileBusy('printing', async () => {
      const job = ExportJob.parse(raw)
      const ready = readyReport(job)
      if (!ready.ok) return ready
      // Codes are only in the report when its request asked for them.
      const report = ready.report
      const bytes = job.format === 'csv' ? reportCsv(report) : await reportXlsx(report, ready.school)
      const path = await pickOutputPath(
        fileName(report, job.format),
        job.format === 'csv'
          ? { name: 'CSV file', extension: 'csv' }
          : { name: 'Excel workbook', extension: 'xlsx' }
      )
      if (!path) return { ok: false, cancelled: true, message: '' }
      const refused = recordReport(ready.report, 'exported', job.format)
      if (refused) return { ok: false, message: `${refused} Nothing was saved.` }
      await writeOutput(path, bytes)
      return { ok: true, path }
    })
  })
}
