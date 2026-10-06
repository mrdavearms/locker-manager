import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as fontkit from 'fontkit'

// The label and letter font (SPEC.md 5.3): Arimo, metric-compatible with Arial and
// shipped with the app (SIL Open Font License), so output is identical on every
// computer. Text is measured with the same font files the PDF embeds.

export type Weight = 400 | 700

const FILES: Record<Weight, { latin: string; ext: string }> = {
  400: { latin: 'arimo-latin-400-normal.woff2', ext: 'arimo-latin-ext-400-normal.woff2' },
  700: { latin: 'arimo-latin-700-normal.woff2', ext: 'arimo-latin-ext-700-normal.woff2' }
}

const LATIN_RANGE =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
const EXT_RANGE =
  'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'

let fontDir: string = join(process.cwd(), 'resources', 'fonts')

/** Set by the main process at start-up (the packaged app keeps fonts in resources/). */
export function setFontDir(dir: string): void {
  fontDir = dir
  cache.clear()
}

interface Loaded {
  latin: fontkit.Font
  ext: fontkit.Font
  latinBytes: Buffer
  extBytes: Buffer
}

const cache = new Map<Weight, Loaded>()

function load(weight: Weight): Loaded {
  const hit = cache.get(weight)
  if (hit) return hit
  const latinBytes = readFileSync(join(fontDir, FILES[weight].latin))
  const extBytes = readFileSync(join(fontDir, FILES[weight].ext))
  const loaded = {
    latin: fontkit.create(latinBytes) as fontkit.Font,
    ext: fontkit.create(extBytes) as fontkit.Font,
    latinBytes,
    extBytes
  }
  cache.set(weight, loaded)
  return loaded
}

const PT_TO_MM = 25.4 / 72

/** Real width in millimetres of text at a font size in points, glyph by glyph. */
export function textWidthMm(text: string, sizePt: number, weight: Weight): number {
  const f = load(weight)
  let units = 0
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    const font = f.latin.hasGlyphForCodePoint(cp)
      ? f.latin
      : f.ext.hasGlyphForCodePoint(cp)
        ? f.ext
        : f.latin
    units += font.layout(ch).advanceWidth
  }
  return (units / f.latin.unitsPerEm) * sizePt * PT_TO_MM
}

/** @font-face rules that embed the fonts in a page, so Chromium renders exactly what was measured. */
export function fontFaceCss(family = 'LMArimo'): string {
  const out: string[] = []
  for (const weight of [400, 700] as const) {
    const f = load(weight)
    out.push(
      `@font-face{font-family:${family};font-weight:${weight};src:url(data:font/woff2;base64,${f.latinBytes.toString('base64')}) format('woff2');unicode-range:${LATIN_RANGE}}`,
      `@font-face{font-family:${family};font-weight:${weight};src:url(data:font/woff2;base64,${f.extBytes.toString('base64')}) format('woff2');unicode-range:${EXT_RANGE}}`
    )
  }
  return out.join('\n')
}

export const LINE_HEIGHT = 1.15
export { PT_TO_MM }
