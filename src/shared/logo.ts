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

/**
 * A one-colour version for mono labels: dark parts black, light parts white, and
 * a transparent background left transparent, so the detail inside a crest
 * survives. Near-white parts that touch the transparent background (white
 * lettering beside a crest) would vanish on white labels, so they turn black;
 * near-white parts enclosed by darker ones stay white. Pass the picture's width
 * and height so "touching" is worked out in two dimensions; without them the
 * pixels are read as one row.
 */
export function makeMonoLogo(
  rgba: ArrayLike<number>,
  width?: number,
  height?: number
): {
  pixels: Uint8ClampedArray<ArrayBuffer>
  method: 'threshold' | 'darkened'
} {
  const a = analyseLogo(rgba)
  const n = Math.floor(rgba.length / 4)
  const w = width ?? n
  const h = height ?? 1
  const lum = (i: number): number =>
    luminance(rgba[i * 4] ?? 0, rgba[i * 4 + 1] ?? 0, rgba[i * 4 + 2] ?? 0)
  const clear = (i: number): boolean => (rgba[i * 4 + 3] ?? 0) < 24

  // Spread from the transparent background into every near-white pixel it touches.
  const darken = new Uint8Array(n)
  let darkened = 0
  if (!a.hasBackground) {
    const stack: number[] = []
    for (let i = 0; i < n; i++) if (clear(i)) stack.push(i)
    while (stack.length > 0) {
      const i = stack.pop() as number
      const x = i % w
      const next = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]
      for (const j of next) {
        if (j < 0 || j >= n || darken[j] || clear(j) || lum(j) <= 0.85) continue
        darken[j] = 1
        darkened++
        stack.push(j)
      }
    }
  }

  const out = new Uint8ClampedArray(rgba.length)
  for (let i = 0; i < n && i < w * h; i++) {
    const v = darken[i] || lum(i) < 0.6 ? 0 : 255
    out[i * 4] = v
    out[i * 4 + 1] = v
    out[i * 4 + 2] = v
    out[i * 4 + 3] = a.hasBackground ? 255 : (rgba[i * 4 + 3] ?? 0)
  }
  return { pixels: out, method: darkened > 0 ? 'darkened' : 'threshold' }
}
