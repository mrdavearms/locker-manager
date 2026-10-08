import { ipcMain, type WebContents } from 'electron'
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
import { overflowingLetters, pdfPageCount, printHtml, printReport, reportToPdf } from './render/pdf'
import { runLetterJob } from './render/letterJob'
import { prepareLetterChunks, prepareLetters, type PreparedLetters } from './render/prepareLetters'
import { buildReportHtml, reportDate, reportFooter } from './render/report'
import { pickOutputPath, stampDate, writeOutput } from './renderService'
import { recordThenPrint } from './printFlow'

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

// Only one letters job runs at a time from the window; Cancel sets this and
// each job clears it when it starts. The job looks at it before every chunk.
let cancelRequested = false

/**
 * Builds the letters with real codes and checks every one fits its page, a
 * chunk at a time with progress sent to the window. For a PDF it also makes the
 * PDF (`bytes`); for printing it stops after the check.
 */
async function readyLetters(
  job: z.infer<typeof LettersJob>,
  sender: WebContents,
  to: 'pdf' | 'printer'
): Promise<
  | { ok: true; p: PreparedLetters; bytes: Uint8Array }
  | { ok: false; cancelled?: boolean; message: string }
> {
  cancelRequested = false
  const s = fileSession()
  const { chunks, prepared: p } = s.read((db) =>
    prepareLetterChunks(db, { ...job, masked: false, preview: false })
  )
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
  const r = await runLetterJob(
    chunks,
    {
      onProgress: (done, total, stage) => {
        if (!sender.isDestroyed())
          sender.send(channels.renderLettersProgress, { done, total, stage })
      },
      cancelled: () => cancelRequested
    },
    undefined,
    to === 'printer'
  )
  if (r.ok) return { ok: true, p, bytes: r.bytes }
  if ('cancelled' in r) return { ok: false, cancelled: true, message: '' }
  return { ok: false, message: overflowMessage(p, r.overflow) }
}

/**
 * Records the letters (and every code in them) BEFORE the file is written, so no
 * code ever leaves the app unrecorded. Returns why it could not, or null.
 */
function recordLetters(p: PreparedLetters, to: 'pdf' | 'printer'): Recorded {
  const hasCodes = p.items.some((i) => i.code)
  const why = recordBlocked(hasCodes)
  if (why !== undefined) return why === null ? { jobId: null } : { refused: why }
  const lockerIds = p.items.map((i) => i.record.lockerId)
  try {
    const jobId = fileSession().write(
      { action: 'letters.printed', entity: 'print_job', after: { letters: lockerIds.length, to } },
      (db, ctx) => {
        for (const i of p.items) if (i.code) revealCode(db, ctx, i.record.lockerId, 'letter')
        return recordPrintJob(db, ctx, 'letters', lockerIds)
      }
    )
    return { jobId }
  } catch (error) {
    if (hasCodes) return { refused: error instanceof Error ? error.message : String(error) }
  }
  return { jobId: null }
}

/** Written or not, what came of recording a print or export. */
type Recorded = { refused: string } | { jobId: string | null }

/**
 * The print dialog was cancelled or printing failed after the record was written.
 * The reveal record stays (codes may have reached the print queue); the print job
 * is removed so the letters still show as not printed, and the history says so.
 */
function notPrinted(kind: 'letters' | 'report', jobId: string | null): (() => void) | null {
  if (!jobId) return null
  return () =>
    fileSession().write({ action: `${kind}.print_cancelled`, entity: 'print_job' }, (db) =>
      db.run('DELETE FROM print_job WHERE id = $id', { $id: jobId })
    )
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

function recordReport(report: BuiltReport, how: 'printed' | 'exported', to: string): Recorded {
  const hasCodes = report.revealedLockers.length > 0
  const why = recordBlocked(hasCodes)
  if (why !== undefined) return why === null ? { jobId: null } : { refused: why }
  try {
    const jobId = fileSession().write(
      {
        action: how === 'printed' ? 'report.printed' : 'report.exported',
        entity: 'print_job',
        after: { report: report.title, rows: report.rows, to, codes: report.revealedLockers.length }
      },
      (db, ctx) => {
        for (const id of report.revealedLockers)
          revealCode(db, ctx, id, how === 'printed' ? 'report' : 'export')
        return how === 'printed' ? recordPrintJob(db, ctx, 'report', report.revealedLockers) : null
      }
    )
    return { jobId }
  } catch (error) {
    if (hasCodes) return { refused: error instanceof Error ? error.message : String(error) }
  }
  return { jobId: null }
}

function fileName(report: BuiltReport, ext: string): string {
  return `${report.confidential ? 'CONFIDENTIAL ' : ''}${report.title} ${stampDate()}.${ext}`
}

export function registerDocumentHandlers(): void {
  ipcMain.on(channels.renderLettersCancel, () => {
    cancelRequested = true
  })

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

  ipcMain.handle(channels.renderLettersPdf, async (e, raw: unknown): Promise<Saved> => {
    return await whileBusy('printing', async () => {
      const ready = await readyLetters(LettersJob.parse(raw), e.sender, 'pdf')
      if (!ready.ok) return ready
      const bytes = ready.bytes
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
      const rec = recordLetters(ready.p, 'pdf')
      if ('refused' in rec) return { ok: false, message: `${rec.refused} Nothing was saved.` }
      await writeOutput(path, bytes)
      return { ok: true, path }
    })
  })

  ipcMain.handle(channels.renderLettersPrint, async (e, raw: unknown): Promise<ActionResult> => {
    return await whileBusy('printing', async () => {
      const ready = await readyLetters(LettersJob.parse(raw), e.sender, 'printer')
      if (!ready.ok) return ready
      const p = ready.p
      return await recordThenPrint({
        record: () => {
          const rec = recordLetters(p, 'printer')
          return 'refused' in rec ? rec : { undo: notPrinted('letters', rec.jobId) }
        },
        print: () => printHtml(p.html, { widthMm: p.page.width, heightMm: p.page.height })
      })
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
      const rec = recordReport(ready.report, 'printed', 'pdf')
      if ('refused' in rec) return { ok: false, message: `${rec.refused} Nothing was saved.` }
      await writeOutput(path, bytes)
      return { ok: true, path }
    })
  })

  ipcMain.handle(channels.renderReportPrint, async (_e, raw: unknown): Promise<ActionResult> => {
    return await whileBusy('printing', async () => {
      const ready = readyReport(ReportJob.parse(raw))
      if (!ready.ok) return ready
      const page = { school: ready.school, printedAt: new Date(), preview: false }
      const report = ready.report
      return await recordThenPrint({
        record: () => {
          const rec = recordReport(report, 'printed', 'printer')
          return 'refused' in rec ? rec : { undo: notPrinted('report', rec.jobId) }
        },
        print: () =>
          printReport(buildReportHtml(report, page), {
            landscape: report.landscape,
            footer: `${ready.school} · ${report.title}${report.confidential ? ' · CONFIDENTIAL' : ''} · Printed ${reportDate(page.printedAt)}`
          })
      })
    })
  })

  ipcMain.handle(channels.renderReportExport, async (_e, raw: unknown): Promise<Saved> => {
    return await whileBusy('printing', async () => {
      const job = ExportJob.parse(raw)
      const ready = readyReport(job)
      if (!ready.ok) return ready
      // Codes are only in the report when its request asked for them.
      const report = ready.report
      const bytes =
        job.format === 'csv' ? reportCsv(report) : await reportXlsx(report, ready.school)
      const path = await pickOutputPath(
        fileName(report, job.format),
        job.format === 'csv'
          ? { name: 'CSV file', extension: 'csv' }
          : { name: 'Excel workbook', extension: 'xlsx' }
      )
      if (!path) return { ok: false, cancelled: true, message: '' }
      const rec = recordReport(ready.report, 'exported', job.format)
      if ('refused' in rec) return { ok: false, message: `${rec.refused} Nothing was saved.` }
      await writeOutput(path, bytes)
      return { ok: true, path }
    })
  })
}
