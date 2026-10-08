import type { ActionResult } from '@shared/ipc'

export interface RecordThenPrintSteps {
  /** Writes the reveal record and print job, or says why it cannot. */
  record: () => { refused: string } | { undo: (() => void) | null }
  print: () => Promise<{ printed: boolean; reason?: string }>
}

/**
 * Printing straight to a printer (decision 15): every code is recorded BEFORE the
 * print dialog opens, as saving a PDF does, so no code reaches paper unrecorded. A
 * print that does not happen leaves the reveal record in place (the safe side) and
 * `undo` notes that nothing was printed.
 */
export async function recordThenPrint(steps: RecordThenPrintSteps): Promise<ActionResult> {
  const rec = steps.record()
  if ('refused' in rec) return { ok: false, message: `${rec.refused} Nothing was printed.` }
  let r: { printed: boolean; reason?: string }
  try {
    r = await steps.print()
  } catch (error) {
    r = { printed: false, reason: String(error) }
  }
  if (r.printed) return { ok: true }
  try {
    rec.undo?.()
  } catch {
    // The reveal record stays either way.
  }
  const cancelled = r.reason === 'cancelled'
  return {
    ok: false,
    cancelled,
    message: cancelled ? '' : `Printing did not finish: ${r.reason ?? 'unknown'}.`
  }
}
