import { describe, expect, it } from 'vitest'
import { analyseLogo, makeMonoLogo } from '../../src/shared/logo'

function image(pixels: [number, number, number, number][]): Uint8ClampedArray {
  return new Uint8ClampedArray(pixels.flat())
}
const WHITE: [number, number, number, number] = [255, 255, 255, 255]
const NAVY: [number, number, number, number] = [20, 40, 90, 255]
const CLEAR: [number, number, number, number] = [0, 0, 0, 0]

describe('analyseLogo (SPEC.md section 15, item 12)', () => {
  it('warns about white lettering on a transparent background', () => {
    const a = analyseLogo(
      image([...Array(60).fill(CLEAR), ...Array(30).fill(WHITE), ...Array(10).fill(NAVY)])
    )
    expect(a.vanishesOnWhite).toBe(true)
  })
  it('is happy with dark lettering on a transparent background', () => {
    expect(
      analyseLogo(image([...Array(60).fill(CLEAR), ...Array(40).fill(NAVY)])).vanishesOnWhite
    ).toBe(false)
  })
  it('is happy with a logo on its own background', () => {
    const a = analyseLogo(image([...Array(70).fill(WHITE), ...Array(30).fill(NAVY)]))
    expect(a.hasBackground).toBe(true)
    expect(a.vanishesOnWhite).toBe(false)
  })
})

describe('makeMonoLogo', () => {
  it('turns a transparent logo into a black silhouette, so white lettering shows', () => {
    const { pixels, method } = makeMonoLogo(image([CLEAR, WHITE, NAVY]))
    expect(method).toBe('silhouette')
    expect([...pixels]).toEqual([0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 255])
  })
  it('thresholds a logo with its own background to black on white', () => {
    const { pixels, method } = makeMonoLogo(image([...Array(20).fill(WHITE), NAVY]))
    expect(method).toBe('threshold')
    expect([...pixels.slice(0, 4)]).toEqual([255, 255, 255, 255])
    expect([...pixels.slice(-4)]).toEqual([0, 0, 0, 255])
  })
})
