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
 * A one-colour version for mono labels. A logo on a transparent background
 * becomes a black silhouette (so white lettering shows); a logo with its own
 * background is thresholded to black on white.
 */
export function makeMonoLogo(rgba: ArrayLike<number>): {
  pixels: Uint8ClampedArray<ArrayBuffer>
  method: 'silhouette' | 'threshold'
} {
  const a = analyseLogo(rgba)
  const out = new Uint8ClampedArray(rgba.length)
  const n = Math.floor(rgba.length / 4)
  for (let i = 0; i < n; i++) {
    const alpha = rgba[i * 4 + 3] ?? 0
    if (a.hasBackground) {
      const dark = luminance(rgba[i * 4] ?? 0, rgba[i * 4 + 1] ?? 0, rgba[i * 4 + 2] ?? 0) < 0.6
      const v = dark ? 0 : 255
      out[i * 4] = v
      out[i * 4 + 1] = v
      out[i * 4 + 2] = v
      out[i * 4 + 3] = 255
    } else {
      out[i * 4] = 0
      out[i * 4 + 1] = 0
      out[i * 4 + 2] = 0
      out[i * 4 + 3] = alpha
    }
  }
  return { pixels: out, method: a.hasBackground ? 'threshold' : 'silhouette' }
}
