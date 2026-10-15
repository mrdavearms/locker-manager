// Colour contrast for printed letters, worked out the WCAG way (the web
// accessibility guidelines): 4.5 to 1 for ordinary text, 3 to 1 for large text.
// Used so a pale school colour never prints white-on-gold or gold-on-white.

export const TEXT_CONTRAST = 4.5
export const LARGE_TEXT_CONTRAST = 3

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', '').slice(0, 6).padEnd(6, '0'), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b]
    .map((v) =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`.toUpperCase()
}

/** Relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Black or white text, whichever reads better on this background. */
export function textOn(background: string): '#FFFFFF' | '#141414' {
  return contrast('#FFFFFF', background) >= contrast('#141414', background) ? '#FFFFFF' : '#141414'
}

/**
 * The colour darkened just enough to reach the contrast against every background
 * given (in steps of 4%), so a gold heading prints a readable dark gold.
 */
export function darkenFor(
  colour: string,
  backgrounds: readonly string[],
  ratio = TEXT_CONTRAST
): string {
  const rgb = hexToRgb(colour)
  for (let k = 1; k >= 0; k -= 0.04) {
    const c = rgbToHex([rgb[0] * k, rgb[1] * k, rgb[2] * k])
    if (backgrounds.every((b) => contrast(c, b) >= ratio)) return c
  }
  return '#000000'
}
