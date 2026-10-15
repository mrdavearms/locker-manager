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

/**
 * A4 and US Letter pages go to the printer by name. A printer driver set to
 * another paper is less likely to override a named size than a custom one, which
 * could cut off or shrink the bottom row of labels (print audit M7).
 */
export function namedPaper(widthMm: number, heightMm: number): 'A4' | 'Letter' | null {
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.5
  if (near(widthMm, 210) && near(heightMm, 297)) return 'A4'
  if (near(widthMm, 215.9) && near(heightMm, 279.4)) return 'Letter'
  return null
}

/** Most printers cannot print this close to the paper's edge (mm). */
export const PRINTER_EDGE_MM = 4

/**
 * The sides of the paper where label words, after the printer nudge, come
 * closer to the edge than printers can print, so they would be cut off
 * (print audit, Low). Words sit inside each label by the safe margin.
 */
export function nearPaperEdge(
  s: Stock,
  offset: { right: number; down: number },
  safeMargin: number
): ('left' | 'top' | 'right' | 'bottom')[] {
  const left = s.left + offset.right + safeMargin
  const top = s.top + offset.down + safeMargin
  const right = s.left + (s.columns - 1) * s.pitchX + s.labelWidth + offset.right - safeMargin
  const bottom = s.top + (s.rows - 1) * s.pitchY + s.labelHeight + offset.down - safeMargin
  const out: ('left' | 'top' | 'right' | 'bottom')[] = []
  if (left < PRINTER_EDGE_MM) out.push('left')
  if (top < PRINTER_EDGE_MM) out.push('top')
  if (right > s.pageWidth - PRINTER_EDGE_MM) out.push('right')
  if (bottom > s.pageHeight - PRINTER_EDGE_MM) out.push('bottom')
  return out
}
