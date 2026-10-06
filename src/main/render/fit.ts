import { LINE_HEIGHT, PT_TO_MM, textWidthMm, type Weight } from './fonts'

// Auto-fit (SPEC.md 5.1 and section 15, item 8): text shrinks from the largest
// size to the smallest, measured with real glyph widths; then tries two lines;
// then is flagged "too long". Long names happen ("Kushini Siddi Arachchige").

export interface Fitted {
  lines: string[]
  sizePt: number
  tooLong: boolean
}

const STEP = 0.5

function fitsOneLine(text: string, size: number, w: number, h: number, weight: Weight): boolean {
  return textWidthMm(text, size, weight) <= w + 1e-6 && size * PT_TO_MM * LINE_HEIGHT <= h + 1e-6
}

/** Best split of text into two lines: the one whose longer line is shortest. */
function bestSplit(text: string, size: number, weight: Weight): [string, string] | null {
  const words = text.split(' ')
  if (words.length < 2) return null
  let best: [string, string] | null = null
  let bestWidth = Infinity
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ')
    const b = words.slice(i).join(' ')
    const wMax = Math.max(textWidthMm(a, size, weight), textWidthMm(b, size, weight))
    if (wMax < bestWidth) {
      bestWidth = wMax
      best = [a, b]
    }
  }
  return best
}

export function fitText(
  text: string,
  box: { w: number; h: number },
  sizes: { max: number; min: number },
  weight: Weight,
  allowTwoLines = true
): Fitted {
  const t = text.trim()
  if (t === '') return { lines: [], sizePt: sizes.max, tooLong: false }
  const max = Math.max(sizes.max, sizes.min)
  const min = Math.min(sizes.max, sizes.min)
  for (let size = max; size >= min - 1e-9; size -= STEP) {
    if (fitsOneLine(t, size, box.w, box.h, weight))
      return { lines: [t], sizePt: size, tooLong: false }
  }
  if (allowTwoLines) {
    for (let size = max; size >= min - 1e-9; size -= STEP) {
      const split = bestSplit(t, size, weight)
      if (!split) break
      const fitsWidth = split.every((line) => textWidthMm(line, size, weight) <= box.w + 1e-6)
      const fitsHeight = 2 * size * PT_TO_MM * LINE_HEIGHT <= box.h + 1e-6
      if (fitsWidth && fitsHeight) return { lines: split, sizePt: size, tooLong: false }
    }
  }
  return { lines: [t], sizePt: min, tooLong: true }
}
