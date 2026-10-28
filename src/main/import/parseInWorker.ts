import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import type { ParsedFile } from './parse'

// The row and column limits in parse.ts apply while the spreadsheet libraries read a
// file, but ExcelJS and SheetJS can still build millions of cells first: a 6.5 KB
// workbook with one huge merged range, or an 809-byte OpenDocument file with a
// repeated column, ran the app out of memory and closed it, losing unsaved changes.
// So each file is read in a worker thread with its own memory and time limits; a
// file that goes over them stops only the worker.

export const PARSE_LIMITS = { memoryMb: 1024, timeMs: 2 * 60 * 1000 }

/** The built worker, beside the main process bundle (electron.vite.config.ts). */
export const importWorkerPath = (): string => join(__dirname, 'importWorker.cjs')

const tooBig = (name: string): string =>
  `"${name}" is too large or too complicated to read. Open it in Excel, save it as CSV, and import the CSV file instead.`

export function parseInWorker(
  workerPath: string,
  name: string,
  bytes: Uint8Array,
  limits: { memoryMb: number; timeMs: number } = PARSE_LIMITS
): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, {
      workerData: { name, bytes },
      resourceLimits: { maxOldGenerationSizeMb: limits.memoryMb }
    })
    let settled = false
    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
      void worker.terminate()
    }
    const timer = setTimeout(() => finish(() => reject(new Error(tooBig(name)))), limits.timeMs)
    worker.once('message', (m: { ok: true; file: ParsedFile } | { ok: false; message: string }) =>
      finish(() => (m.ok ? resolve(m.file) : reject(new Error(m.message))))
    )
    worker.once('error', (error: Error & { code?: string }) =>
      finish(() =>
        reject(
          error.code === 'ERR_WORKER_OUT_OF_MEMORY'
            ? new Error(tooBig(name))
            : new Error(`"${name}" could not be read (${error.message}).`)
        )
      )
    )
    worker.once('exit', () => finish(() => reject(new Error(tooBig(name)))))
  })
}
