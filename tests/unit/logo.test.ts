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
  it('turns white lettering on a transparent background black, so it shows on white', () => {
    const { pixels, method } = makeMonoLogo(
      image([...Array(60).fill(CLEAR), ...Array(30).fill(WHITE), ...Array(10).fill(NAVY)])
    )
    expect(method).toBe('darkened')
    expect([...pixels.slice(0, 4)]).toEqual([0, 0, 0, 0])
    expect([...pixels.slice(60 * 4, 61 * 4)]).toEqual([0, 0, 0, 255])
    expect([...pixels.slice(-4)]).toEqual([0, 0, 0, 255])
  })
  it('keeps white inside a crest white, while white lettering beside it turns black', () => {
    // One row: background, white lettering, background, crest edge, white inside, crest edge.
    const { pixels } = makeMonoLogo(image([CLEAR, WHITE, CLEAR, NAVY, WHITE, NAVY]), 6, 1)
    expect([...pixels.slice(4, 8)]).toEqual([0, 0, 0, 255])
    expect([...pixels.slice(16, 20)]).toEqual([255, 255, 255, 255])
  })
  it('keeps the detail inside a transparent logo that is mostly dark', () => {
    const GREY: [number, number, number, number] = [190, 190, 190, 255]
    const YELLOW: [number, number, number, number] = [255, 205, 0, 255]
    const { pixels, method } = makeMonoLogo(
      image([...Array(60).fill(CLEAR), ...Array(30).fill(NAVY), GREY, YELLOW])
    )
    expect(method).toBe('threshold')
    expect([...pixels.slice(0, 4)]).toEqual([0, 0, 0, 0])
    expect([...pixels.slice(60 * 4, 61 * 4)]).toEqual([0, 0, 0, 255])
    expect([...pixels.slice(-8)]).toEqual([255, 255, 255, 255, 255, 255, 255, 255])
  })
  it('thresholds a logo with its own background to black on white', () => {
    const { pixels, method } = makeMonoLogo(image([...Array(20).fill(WHITE), NAVY]))
    expect(method).toBe('threshold')
    expect([...pixels.slice(0, 4)]).toEqual([255, 255, 255, 255])
    expect([...pixels.slice(-4)]).toEqual([0, 0, 0, 255])
  })
})
