import { writeFile } from 'node:fs/promises'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import log from 'electron-log/main'
import { z } from 'zod'
import { channels } from '@shared/channels'
import { LabelSelectionSchema } from '@shared/labels'
import type { ActionResult } from '@shared/ipc'
import { whileBusy } from './busy'
import { fileSession } from './fileService'
import { recordPrintJob } from './repos/labels'
import { pdfPageCount, htmlToPdf, printHtml } from './render/pdf'
import { prepareCalibration, prepareLabels } from './render/prepare'

// Saving and printing (SPEC.md 5.1 and 5.3). The data comes from the open file
// through the session; Electron turns it into a PDF or sends it to a printer.

const LabelsJob = z.object({
  selection: LabelSelectionSchema,
  startAt: z.number().int().min(1).max(100),
  printer: z.string().max(80).nullable()
})
const CalibrationJob = z.object({
  stockId: z.string().max(64).nullable(),
  printer: z.string().max(80).nullable()
})
const OpenPdf = z.object({ path: z.string().min(1) })

/** PDFs this session made; only these may be opened from the window. */
const made = new Set<string>()

type OutputFilter = { name: string; extension: string }
const PDF: OutputFilter = { name: 'PDF', extension: 'pdf' }

/** Asks where to save. Nothing is written yet, so a record can be made first. */
export async function pickOutputPath(
  defaultName: string,
  filter: OutputFilter = PDF
): Promise<string | null> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const opts = {
    title: `Save the ${filter.name}`,
    defaultPath: `${app.getPath('documents')}/${defaultName}`,
    filters: [{ name: filter.name, extensions: [filter.extension] }]
  }
  const pick = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
  if (pick.canceled || !pick.filePath) return null
  const ext = `.${filter.extension}`
  return pick.filePath.toLowerCase().endsWith(ext) ? pick.filePath : `${pick.filePath}${ext}`
}

/** Writes a file chosen with pickOutputPath, and remembers it so the window may open it. */
export async function writeOutput(path: string, bytes: Uint8Array | string): Promise<void> {
  await writeFile(path, bytes)
  made.add(path)
}

/** Asks where to save, writes the file, and remembers it so the window may open it. */
export async function saveOutput(
  defaultName: string,
  bytes: Uint8Array | string,
  filter: OutputFilter = PDF
): Promise<string | null> {
  const path = await pickOutputPath(defaultName, filter)
  if (!path) return null
  await writeOutput(path, bytes)
  return path
}

const savePdf = (name: string, bytes: Uint8Array): Promise<string | null> => saveOutput(name, bytes)

export function stampDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function registerRenderHandlers(): void {
  ipcMain.handle(
    channels.renderLabelsPdf,
    async (_e, raw: unknown): Promise<ActionResult & { path?: string }> => {
      return await whileBusy('printing', async () => {
        const job = LabelsJob.parse(raw)
        const s = fileSession()
        const prepared = s.read((db) => prepareLabels(db, { ...job, outlines: false }))
        if (prepared.placed.length === 0)
          return { ok: false, message: 'There are no labels to print for that choice.' }
        const bytes = await htmlToPdf(prepared.html)
        const pages = await pdfPageCount(bytes)
        if (pages !== prepared.sheets) {
          log.warn('label page count mismatch', pages, prepared.sheets)
          return {
            ok: false,
            message: `The PDF came out with ${pages} pages instead of ${prepared.sheets}. Nothing was saved.`
          }
        }
        const path = await savePdf(`Locker labels ${stampDate()}.pdf`, bytes)
        if (!path) return { ok: false, cancelled: true, message: '' }
        if (s.state.status === 'open' && s.state.mode === 'edit') {
          s.write(
            {
              action: 'labels.printed',
              entity: 'print_job',
              after: { labels: prepared.lockerIds.length, to: 'pdf' }
            },
            (db, ctx) => recordPrintJob(db, ctx, 'labels', prepared.lockerIds)
          )
        }
        return { ok: true, path }
      })
    }
  )

  ipcMain.handle(channels.renderLabelsPrint, async (_e, raw: unknown): Promise<ActionResult> => {
    return await whileBusy('printing', async () => {
      const job = LabelsJob.parse(raw)
      const s = fileSession()
      const prepared = s.read((db) => prepareLabels(db, { ...job, outlines: false }))
      if (prepared.placed.length === 0)
        return { ok: false, message: 'There are no labels to print for that choice.' }
      const r = await printHtml(prepared.html, {
        widthMm: prepared.stock.pageWidth,
        heightMm: prepared.stock.pageHeight
      })
      if (!r.printed)
        return {
          ok: false,
          cancelled: r.reason === 'cancelled',
          message:
            r.reason === 'cancelled'
              ? ''
              : `Printing did not finish: ${r.reason ?? 'unknown reason'}.`
        }
      if (s.state.status === 'open' && s.state.mode === 'edit') {
        s.write(
          {
            action: 'labels.printed',
            entity: 'print_job',
            after: { labels: prepared.lockerIds.length, to: 'printer' }
          },
          (db, ctx) => recordPrintJob(db, ctx, 'labels', prepared.lockerIds)
        )
      }
      return { ok: true }
    })
  })

  ipcMain.handle(
    channels.renderCalibrationPdf,
    async (_e, raw: unknown): Promise<ActionResult & { path?: string }> => {
      return await whileBusy('printing', async () => {
        const job = CalibrationJob.parse(raw)
        const { html } = fileSession().read((db) =>
          prepareCalibration(db, job.stockId, job.printer)
        )
        const path = await savePdf(
          `Label calibration page ${stampDate()}.pdf`,
          await htmlToPdf(html)
        )
        return path ? { ok: true, path } : { ok: false, cancelled: true, message: '' }
      })
    }
  )

  ipcMain.handle(channels.renderOpenPdf, async (_e, raw: unknown): Promise<ActionResult> => {
    const { path } = OpenPdf.parse(raw)
    if (!made.has(path)) return { ok: false, message: 'Only files made here can be opened.' }
    const err = await shell.openPath(path)
    return err ? { ok: false, message: err } : { ok: true }
  })
}
