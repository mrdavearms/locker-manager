import type { Stock } from './labels'

// Pure geometry of a label sheet, shared by the main process and the settings screen.

export function labelsPerSheet(s: Stock): number {
  return s.columns * s.rows
}

/** Where label n (0-based, across then down) sits on its sheet, before printer offsets. */
export function labelPosition(s: Stock, n: number): { x: number; y: number } {
  const i = n % labelsPerSheet(s)
  return { x: s.left + (i % s.columns) * s.pitchX, y: s.top + Math.floor(i / s.columns) * s.pitchY }
}

/** Plain problems with a stock's numbers: labels off the page or overlapping. */
export function stockProblems(s: Stock): string[] {
  const out: string[] = []
  if (s.pitchX + 0.01 < s.labelWidth && s.columns > 1)
    out.push(
      'Labels overlap side by side: the distance between label edges is less than the label width.'
    )
  if (s.pitchY + 0.01 < s.labelHeight && s.rows > 1)
    out.push(
      'Labels overlap top to bottom: the distance between label tops is less than the label height.'
    )
  if (s.left + (s.columns - 1) * s.pitchX + s.labelWidth > s.pageWidth + 0.01)
    out.push('The right-hand labels run off the page.')
  if (s.top + (s.rows - 1) * s.pitchY + s.labelHeight > s.pageHeight + 0.01)
    out.push('The bottom labels run off the page.')
  return out
}
