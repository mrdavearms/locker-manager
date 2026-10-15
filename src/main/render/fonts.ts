import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as fontkit from 'fontkit'

// The label and letter font (SPEC.md 5.3): Arimo, metric-compatible with Arial and
// shipped with the app (SIL Open Font License), so output is identical on every
// computer. Text is measured with the same font files the PDF embeds.

export type Weight = 400 | 700

/**
 * The Arimo subsets shipped in resources/fonts, each with the characters it covers
 * (from @fontsource/arimo's unicode.json). Latin, Vietnamese, Greek, Cyrillic and
 * Hebrew all print in Arimo on every computer (print audit M4).
 */
const SUBSETS: readonly { name: string; range: string }[] = [
  {
    name: 'latin',
    range:
      'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
  },
  {
    name: 'latin-ext',
    range:
      'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'
  },
  {
    name: 'vietnamese',
    range:
      'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB'
  },
  {
    name: 'greek',
    range: 'U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF'
  },
  { name: 'greek-ext', range: 'U+1F00-1FFF' },
  { name: 'cyrillic', range: 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116' },
  {
    name: 'cyrillic-ext',
    range: 'U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F'
  },
  { name: 'hebrew', range: 'U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F' }
]

let fontDir: string = join(process.cwd(), 'resources', 'fonts')

/** Set by the main process at start-up (the packaged app keeps fonts in resources/). */
export function setFontDir(dir: string): void {
  fontDir = dir
  cache.clear()
}

interface Subset {
  font: fontkit.Font
  bytes: Buffer
  range: string
}

const cache = new Map<Weight, Subset[]>()

function load(weight: Weight): Subset[] {
  const hit = cache.get(weight)
  if (hit) return hit
  const loaded = SUBSETS.map(({ name, range }) => {
    const bytes = readFileSync(join(fontDir, `arimo-${name}-${weight}-normal.woff2`))
    return { font: fontkit.create(bytes) as fontkit.Font, bytes, range }
  })
  cache.set(weight, loaded)
  return loaded
}

const PT_TO_MM = 25.4 / 72

/**
 * Width, in ems, given to a character none of the bundled fonts has. It prints
 * in a font from the computer (Arabic, Chinese, Hindi …), so its real width is
 * unknown: one em is the width of a Chinese character, which errs on the wide,
 * safe side for most other scripts. Emoji are a little wider.
 */
function fallbackEms(cp: number): number {
  return cp >= 0x1f000 ? 1.25 : 1
}

/** Real width in millimetres of text at a font size in points, glyph by glyph. */
export function textWidthMm(text: string, sizePt: number, weight: Weight): number {
  const subsets = load(weight)
  const em = subsets[0]!.font.unitsPerEm
  let units = 0
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    const font = subsets.find((s) => s.font.hasGlyphForCodePoint(cp))?.font
    units += font ? font.layout(ch).advanceWidth : fallbackEms(cp) * em
  }
  return (units / em) * sizePt * PT_TO_MM
}

/** @font-face rules that embed the fonts in a page, so Chromium renders exactly what was measured. */
export function fontFaceCss(family = 'LMArimo'): string {
  const out: string[] = []
  for (const weight of [400, 700] as const)
    for (const s of load(weight))
      out.push(
        `@font-face{font-family:${family};font-weight:${weight};src:url(data:font/woff2;base64,${s.bytes.toString('base64')}) format('woff2');unicode-range:${s.range}}`
      )
  return out.join('\n')
}

export const LINE_HEIGHT = 1.15
export { PT_TO_MM }
