import { z } from 'zod'

// Pure checks on a logo's pixels (RGBA, 4 bytes per pixel). Used by the renderer
// after drawing the logo to a canvas. SPEC.md section 15, item 12: a logo with
// white lettering on a transparent background vanishes on white labels.

export interface LogoAnalysis {
  /** Share of all pixels that are (nearly) transparent. */
  transparentShare: number
  /** Share of visible pixels that are very light. */
  lightShare: number
  /** True when the logo would largely disappear on white paper. */
  vanishesOnWhite: boolean
  /** True when the logo has its own (opaque) background. */
  hasBackground: boolean
}

function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

export function analyseLogo(rgba: ArrayLike<number>): LogoAnalysis {
  const n = Math.floor(rgba.length / 4)
  let transparent = 0
  let visible = 0
  let light = 0
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3] ?? 0
    if (a < 24) {
      transparent++
      continue
    }
    visible++
    if (luminance(rgba[i * 4] ?? 0, rgba[i * 4 + 1] ?? 0, rgba[i * 4 + 2] ?? 0) > 0.85) light++
  }
  const transparentShare = n === 0 ? 0 : transparent / n
  const lightShare = visible === 0 ? 0 : light / visible
  return {
    transparentShare,
    lightShare,
    hasBackground: transparentShare < 0.05,
    vanishesOnWhite: transparentShare >= 0.05 && lightShare >= 0.35
  }
}

/** What the one-colour version came out as, for the warning under the logo. */
export type MonoResult = 'ok' | 'blank' | 'solid'

/**
 * A one-colour version for mono labels and letters: dark parts black, light parts
 * white, and see-through parts left see-through (never made solid, or rounded
 * corners print as black wedges).
 *
 * - The cut between black and white is 60% brightness. When almost nothing would
 *   print black (a gold, orange or sky-blue logo), the cut is worked out from the
 *   logo's own light and dark parts instead, and a logo of one flat colour prints
 *   as a solid shape.
 * - Light parts that touch the see-through background (white or gold lettering
 *   beside a crest) would vanish on white labels, so they turn black. Light parts
 *   enclosed by darker ones stay white.
 * - A large light area that touches the see-through background and surrounds the
 *   dark artwork is the logo's own card or tile, so it stays white.
 *
 * Pass the picture's width and height so "touching" is worked out in two
 * dimensions; without them the pixels are read as one row.
 */
export function makeMonoLogo(
  rgba: ArrayLike<number>,
  width?: number,
  height?: number
): {
  pixels: Uint8ClampedArray<ArrayBuffer>
  method: 'threshold' | 'darkened' | 'adaptive' | 'silhouette'
  result: MonoResult
  /** Light lettering on the see-through background was made dark (it would vanish on white). */
  lightLettering: boolean
} {
  const n = Math.floor(rgba.length / 4)
  const w = width ?? n
  const h = height ?? 1
  const size = Math.min(n, w * h)
  const lums = new Float32Array(size)
  const clear = new Uint8Array(size)
  let visible = 0
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let i = 0; i < size; i++) {
    lums[i] = luminance(rgba[i * 4] ?? 0, rgba[i * 4 + 1] ?? 0, rgba[i * 4 + 2] ?? 0)
    if ((rgba[i * 4 + 3] ?? 0) < 24) {
      clear[i] = 1
      continue
    }
    visible++
    const x = i % w
    const y = Math.floor(i / w)
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }

  // Where to cut between black and white.
  let cut = 0.6
  let method: 'threshold' | 'darkened' | 'adaptive' | 'silhouette' = 'threshold'
  let dark = 0
  for (let i = 0; i < size; i++) if (!clear[i] && lums[i]! < cut) dark++
  if (visible > 0 && dark < visible * 0.02) {
    const adaptive = otsuCut(lums, clear)
    if (adaptive === null) {
      cut = 2 // every visible pixel prints black
      method = 'silhouette'
    } else {
      cut = adaptive
      method = 'adaptive'
    }
  }
  const isDark = (i: number): boolean => !clear[i] && lums[i]! < cut

  // Light parts connected to the see-through background, one area at a time.
  const darken = new Uint8Array(size)
  const seen = new Uint8Array(size)
  const sat = darkTable(isDark, w, h, size)
  const visW = maxX - minX + 1
  const visH = maxY - minY + 1
  let darkened = 0
  const neighbours = (i: number): number[] => {
    const x = i % w
    return [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]
  }
  for (let s = 0; s < size; s++) {
    if (seen[s] || clear[s] || isDark(s)) continue
    if (!neighbours(s).some((j) => j >= 0 && j < size && clear[j])) continue
    const area: number[] = [s]
    seen[s] = 1
    let ax0 = w
    let ay0 = h
    let ax1 = -1
    let ay1 = -1
    for (let k = 0; k < area.length; k++) {
      const i = area[k]!
      const x = i % w
      const y = Math.floor(i / w)
      if (x < ax0) ax0 = x
      if (x > ax1) ax1 = x
      if (y < ay0) ay0 = y
      if (y > ay1) ay1 = y
      for (const j of neighbours(i)) {
        if (j < 0 || j >= size || seen[j] || clear[j] || isDark(j)) continue
        seen[j] = 1
        area.push(j)
      }
    }
    const darkInside = boxCount(sat, w, ax0, ay0, ax1, ay1)
    const isCard =
      area.length >= visible * 0.25 &&
      darkInside >= visible * 0.05 &&
      ax1 - ax0 + 1 >= visW * 0.5 &&
      ay1 - ay0 + 1 >= visH * 0.5
    if (isCard) continue
    for (const i of area) darken[i] = 1
    darkened += area.length
  }
  if (darkened > 0 && method === 'threshold') method = 'darkened'

  const out = new Uint8ClampedArray(rgba.length)
  let black = 0
  for (let i = 0; i < size; i++) {
    const v = clear[i] || darken[i] || isDark(i) ? 0 : 255
    out[i * 4] = v
    out[i * 4 + 1] = v
    out[i * 4 + 2] = v
    out[i * 4 + 3] = rgba[i * 4 + 3] ?? 0
    if (!clear[i] && v === 0) black++
  }
  // "Solid" only when the picture had clear light and dark parts that were lost.
  let light = 0
  let deep = 0
  for (let i = 0; i < size; i++) {
    if (clear[i]) continue
    if (lums[i]! > 0.85) light++
    else if (lums[i]! < 0.6) deep++
  }
  const share = visible === 0 ? 0 : black / visible
  const hadDetail = light >= visible * 0.1 && deep >= visible * 0.1
  const result: MonoResult = share < 0.02 ? 'blank' : share > 0.97 && hadDetail ? 'solid' : 'ok'
  const lightLettering =
    darkened >= visible * 0.05 || (method === 'silhouette' && light >= visible * 0.35)
  return { pixels: out, method, result, lightLettering }
}

/**
 * The brightness that best splits the visible pixels into a light and a dark group
 * (Otsu's method), or null when the logo is all one tone.
 */
function otsuCut(lums: Float32Array, clear: Uint8Array): number | null {
  const bins = new Float64Array(256)
  let count = 0
  for (let i = 0; i < lums.length; i++) {
    if (clear[i]) continue
    bins[Math.min(255, Math.round(lums[i]! * 255))]!++
    count++
  }
  if (count === 0) return null
  let total = 0
  for (let b = 0; b < 256; b++) total += b * bins[b]!
  let bestCut = -1
  let best = 0
  let weightLow = 0
  let sumLow = 0
  for (let b = 0; b < 255; b++) {
    weightLow += bins[b]!
    if (weightLow === 0) continue
    const weightHigh = count - weightLow
    if (weightHigh === 0) break
    sumLow += b * bins[b]!
    const meanLow = sumLow / weightLow
    const meanHigh = (total - sumLow) / weightHigh
    const between = weightLow * weightHigh * (meanLow - meanHigh) ** 2
    if (between > best && meanHigh - meanLow >= 20) {
      best = between
      bestCut = b
    }
  }
  return bestCut < 0 ? null : (bestCut + 0.5) / 255
}

/** A summed-area table of dark pixels, so any box's dark count is four lookups. */
function darkTable(isDark: (i: number) => boolean, w: number, h: number, size: number): Int32Array {
  const t = new Int32Array((w + 1) * (h + 1))
  for (let y = 0; y < h; y++) {
    let row = 0
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (i < size && isDark(i)) row++
      t[(y + 1) * (w + 1) + x + 1] = t[y * (w + 1) + x + 1]! + row
    }
  }
  return t
}

function boxCount(
  t: Int32Array,
  w: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): number {
  const W = w + 1
  return t[(y1 + 1) * W + x1 + 1]! - t[y0 * W + x1 + 1]! - t[(y1 + 1) * W + x0]! + t[y0 * W + x0]!
}

/**
 * The main colour of the visible artwork (near-white parts left out), so letters
 * can tell when the logo would vanish into a heading band of the same colour.
 */
export function inkColour(rgba: ArrayLike<number>): string | null {
  const n = Math.floor(rgba.length / 4)
  const sum = [0, 0, 0]
  const all = [0, 0, 0]
  let inked = 0
  let visible = 0
  for (let i = 0; i < n; i++) {
    if ((rgba[i * 4 + 3] ?? 0) < 24) continue
    const r = rgba[i * 4] ?? 0
    const g = rgba[i * 4 + 1] ?? 0
    const b = rgba[i * 4 + 2] ?? 0
    visible++
    all[0]! += r
    all[1]! += g
    all[2]! += b
    if (luminance(r, g, b) > 0.85) continue
    inked++
    sum[0]! += r
    sum[1]! += g
    sum[2]! += b
  }
  const use = inked > 0 ? sum : all
  const count = inked > 0 ? inked : visible
  if (count === 0) return null
  return `#${use
    .map((v) =>
      Math.round(v / count)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`.toUpperCase()
}

/** Bump when the one-colour logo maker changes, so older files offer a remake. */
export const LOGO_FACTS_VERSION = 2

/** What the app learnt about the logo when it was chosen (setting `logo.facts`). */
export const LogoFactsSchema = z.object({
  version: z.number().int(),
  /** The picture's own size in pixels (0 for an SVG with no size). */
  width: z.number().int().min(0),
  height: z.number().int().min(0),
  svg: z.boolean(),
  /** Light lettering on a see-through background: vanishes on white paper. */
  lightOnWhite: z.boolean(),
  /** The picture has its own solid background (a JPEG, or a filled square). */
  opaque: z.boolean(),
  /** Main colour of the artwork, near-white parts left out. */
  ink: z
    .string()
    .regex(/^#[0-9A-F]{6}$/i)
    .nullable(),
  /** Made by the app from the colour logo, or the school's own file. */
  mono: z.enum(['auto', 'own']),
  monoResult: z.enum(['ok', 'blank', 'solid'])
})
export type LogoFacts = z.infer<typeof LogoFactsSchema>

/** Wider than this, the words in a logo print too small to read on a label. */
export const WIDE_LOGO = 2.5
/** Shorter side under this many pixels prints visibly soft. */
export const SMALL_LOGO_PX = 300

/** Plain warnings about the logo for Settings, School (empty when all is well). */
export function logoWarnings(f: LogoFacts | null): string[] {
  if (!f) return []
  const out: string[] = []
  if (f.monoResult === 'blank')
    out.push(
      'The one-colour version came out nearly blank, so the logo would not show on black-and-white labels and letters. Choose Use my own one-colour logo… and pick a dark version of your logo.'
    )
  if (f.monoResult === 'solid')
    out.push(
      'The one-colour version is a solid shape with no detail inside it. If you have a black-and-white copy of your logo, choose Use my own one-colour logo… to use it.'
    )
  if (f.lightOnWhite)
    out.push(
      'This logo has light lettering on a see-through background, which would vanish on white paper. Labels and letters with a white background use the one-colour version, where the lettering is dark. Check it below.'
    )
  if (f.width > 0 && f.height > 0) {
    const ratio = Math.max(f.width / f.height, f.height / f.width)
    if (ratio > WIDE_LOGO)
      out.push(
        `This logo is ${ratio.toFixed(1)} times wider than it is tall. On a label it shrinks to fit the logo space, so any words in it print about 1 to 2 mm tall. A version with just the crest or emblem prints much better.`
      )
    if (!f.svg && Math.min(f.width, f.height) < SMALL_LOGO_PX)
      out.push(
        `This logo is only ${f.width} by ${f.height} pixels, so the colour version may print blurry. A copy at least 600 pixels across, or an SVG, prints sharply.`
      )
  }
  return out
}
