import { PDFDocument } from 'pdf-lib'
import { htmlToPdf, overflowingLetters } from './pdf'

export type LetterJobStage = 'checking' | 'making'

export type LetterJobResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; overflow: string[] }
  | { ok: false; cancelled: true }

export interface LetterJobHooks {
  onProgress: (done: number, total: number, stage: LetterJobStage) => void
  cancelled: () => boolean
}

/** How a chunk is measured and printed; tests pass stand-ins. */
export interface LetterJobRender {
  overflowing: (html: string) => Promise<string[]>
  toPdf: (html: string) => Promise<Uint8Array>
}

const realRender: LetterJobRender = { overflowing: overflowingLetters, toPdf: htmlToPdf }

/**
 * Checks every chunk fits (stage `checking`), then makes each chunk's PDF and
 * joins them into one (stage `making`). Cancel is looked at before each chunk.
 * `stopAfterChecking` runs the first stage only (printing, which prints the
 * whole page through the system dialog afterwards); `bytes` is then empty.
 */
export async function runLetterJob(
  chunks: string[],
  hooks: LetterJobHooks,
  render: LetterJobRender = realRender,
  stopAfterChecking = false
): Promise<LetterJobResult> {
  const total = stopAfterChecking ? chunks.length : chunks.length * 2
  let done = 0
  for (const html of chunks) {
    if (hooks.cancelled()) return { ok: false, cancelled: true }
    const over = await render.overflowing(html)
    if (over.length > 0) return { ok: false, overflow: over }
    hooks.onProgress(++done, total, 'checking')
  }
  if (stopAfterChecking) return { ok: true, bytes: new Uint8Array() }
  const merged = await PDFDocument.create()
  for (const html of chunks) {
    if (hooks.cancelled()) return { ok: false, cancelled: true }
    const part = await PDFDocument.load(await render.toPdf(html))
    const pages = await merged.copyPages(part, part.getPageIndices())
    for (const page of pages) merged.addPage(page)
    hooks.onProgress(++done, total, 'making')
  }
  return { ok: true, bytes: await merged.save() }
}
