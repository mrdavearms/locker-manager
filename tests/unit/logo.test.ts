import { describe, expect, it } from 'vitest'
import { analyseLogo, inkColour, logoWarnings, makeMonoLogo } from '../../src/shared/logo'

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

// Small pictures drawn in code, one per logo shape found in the print audit
// (docs/audits/2026-10-15-print-output-audit.md, H1 and H2).
type Px = [number, number, number, number]
const GOLD: Px = [255, 205, 0, 255]
const SKY: Px = [100, 170, 230, 255]
const GREYRING: Px = [200, 200, 200, 255]

class Pic {
  readonly data: Uint8ClampedArray
  constructor(
    readonly w: number,
    readonly h: number,
    fill: Px = CLEAR
  ) {
    this.data = new Uint8ClampedArray(w * h * 4)
    this.rect(0, 0, w, h, fill)
  }
  set(x: number, y: number, c: Px): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return
    this.data.set(c, (y * this.w + x) * 4)
  }
  rect(x0: number, y0: number, w: number, h: number, c: Px): this {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c)
    return this
  }
  circle(cx: number, cy: number, r: number, c: Px): this {
    for (let y = cy - r; y <= cy + r; y++)
      for (let x = cx - r; x <= cx + r; x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.set(x, y, c)
    return this
  }
  mono() {
    const m = makeMonoLogo(this.data, this.w, this.h)
    const at = (x: number, y: number): number[] => [
      ...m.pixels.slice((y * this.w + x) * 4, (y * this.w + x) * 4 + 4)
    ]
    return { ...m, at }
  }
}
const BLACK_OUT = [0, 0, 0, 255]
const WHITE_OUT = [255, 255, 255, 255]
const CLEAR_OUT = [0, 0, 0, 0]

describe('makeMonoLogo: logo shapes from the print audit', () => {
  it('a gold crest on a see-through background prints black, not blank', () => {
    const m = new Pic(40, 40).circle(20, 20, 15, GOLD).mono()
    expect(m.at(20, 20)).toEqual(BLACK_OUT)
    expect(m.at(1, 1)).toEqual(CLEAR_OUT)
    expect(m.result).not.toBe('blank')
  })
  it('a gold disc with white letters keeps the letters white', () => {
    const m = new Pic(40, 40).circle(20, 20, 16, GOLD).rect(16, 16, 8, 8, WHITE).mono()
    expect(m.method).toBe('adaptive')
    expect(m.at(20, 8)).toEqual(BLACK_OUT)
    expect(m.at(20, 20)).toEqual(WHITE_OUT)
    expect(m.result).toBe('ok')
  })
  it('a sky-blue logo with a white chevron keeps the chevron', () => {
    const m = new Pic(40, 40).circle(20, 20, 16, SKY).rect(12, 18, 16, 4, WHITE).mono()
    expect(m.at(20, 8)).toEqual(BLACK_OUT)
    expect(m.at(20, 20)).toEqual(WHITE_OUT)
  })
  it('a white rounded tile keeps its see-through corners and stays white', () => {
    const pic = new Pic(40, 40).rect(3, 0, 34, 40, WHITE).rect(0, 3, 40, 34, WHITE)
    pic.rect(14, 10, 12, 18, NAVY)
    const m = pic.mono()
    expect(m.at(0, 0)).toEqual(CLEAR_OUT)
    expect(m.at(5, 5)).toEqual(WHITE_OUT)
    expect(m.at(20, 20)).toEqual(BLACK_OUT)
  })
  it('a white card with clear space round it stays white, so the crest shows', () => {
    const m = new Pic(60, 60).rect(8, 8, 44, 44, WHITE).rect(22, 18, 16, 24, NAVY).mono()
    expect(m.at(2, 2)).toEqual(CLEAR_OUT)
    expect(m.at(12, 12)).toEqual(WHITE_OUT)
    expect(m.at(30, 30)).toEqual(BLACK_OUT)
    expect(m.result).toBe('ok')
  })
  it('gold lettering beside a navy crest turns black so it shows on white', () => {
    const m = new Pic(80, 30).rect(2, 2, 24, 26, NAVY).rect(34, 10, 30, 8, GOLD).mono()
    expect(m.at(10, 10)).toEqual(BLACK_OUT)
    expect(m.at(40, 14)).toEqual(BLACK_OUT)
  })
  it('white lettering with a light grey edge still turns black', () => {
    const pic = new Pic(80, 30).rect(2, 2, 24, 26, NAVY)
    pic.rect(34, 8, 32, 12, GREYRING).rect(36, 10, 28, 8, WHITE)
    const m = pic.mono()
    expect(m.at(40, 14)).toEqual(BLACK_OUT)
    expect(m.at(34, 8)).toEqual(BLACK_OUT)
  })
  it('white detail inside a navy crest stays white', () => {
    const m = new Pic(40, 40).rect(5, 5, 30, 30, NAVY).rect(15, 15, 10, 10, WHITE).mono()
    expect(m.at(20, 20)).toEqual(WHITE_OUT)
    expect(m.at(7, 7)).toEqual(BLACK_OUT)
  })
  it('a logo on a sky-blue square of its own prints the square black and the letters white', () => {
    const m = new Pic(40, 40, SKY).rect(12, 12, 16, 16, WHITE).mono()
    expect(m.at(2, 2)).toEqual(BLACK_OUT)
    expect(m.at(20, 20)).toEqual(WHITE_OUT)
    expect(m.result).not.toBe('blank')
  })
  it('an all-white logo for dark backgrounds turns black', () => {
    const pic = new Pic(40, 40).circle(20, 20, 16, WHITE).circle(20, 20, 12, CLEAR)
    pic.rect(16, 16, 8, 8, WHITE)
    const m = pic.mono()
    expect(m.at(20, 5)).toEqual(BLACK_OUT)
    expect(m.at(20, 20)).toEqual(BLACK_OUT)
  })
  it('half-see-through edge pixels keep their softness', () => {
    const m = new Pic(20, 20).rect(5, 5, 10, 10, NAVY).rect(4, 5, 1, 10, [20, 40, 90, 120]).mono()
    expect(m.at(4, 8)).toEqual([0, 0, 0, 120])
  })
})

describe('makeMonoLogo: light lettering', () => {
  it('is reported for white lettering beside a crest, not for a white card', () => {
    const lettering = new Pic(80, 30).rect(2, 2, 24, 26, NAVY).rect(34, 10, 30, 8, WHITE).mono()
    expect(lettering.lightLettering).toBe(true)
    const card = new Pic(60, 60).rect(8, 8, 44, 44, WHITE).rect(22, 18, 16, 24, NAVY).mono()
    expect(card.lightLettering).toBe(false)
  })
  it('is reported for an all-white logo', () => {
    expect(new Pic(30, 30).circle(15, 15, 10, WHITE).mono().lightLettering).toBe(true)
  })
})

describe('inkColour and logoWarnings', () => {
  it('finds the main colour without the white parts', () => {
    const pic = new Pic(20, 20).rect(0, 0, 10, 20, NAVY).rect(10, 0, 10, 20, WHITE)
    expect(inkColour(pic.data)).toBe('#14285A')
  })
  it('warns about wide, small, blank and light-lettered logos', () => {
    const base = {
      version: 2,
      width: 1000,
      height: 1000,
      svg: false,
      lightOnWhite: false,
      opaque: false,
      ink: null,
      mono: 'auto' as const,
      monoResult: 'ok' as const
    }
    expect(logoWarnings(base)).toEqual([])
    expect(logoWarnings({ ...base, width: 3000 })[0]).toMatch(/3.0 times wider/)
    expect(logoWarnings({ ...base, width: 120, height: 100 })[0]).toMatch(/blurry/)
    expect(logoWarnings({ ...base, width: 120, height: 100, svg: true })).toEqual([])
    expect(logoWarnings({ ...base, monoResult: 'blank' })[0]).toMatch(/nearly blank/)
    expect(logoWarnings({ ...base, lightOnWhite: true })[0]).toMatch(/light lettering/)
  })
})

describe('makeMonoLogo: the result', () => {
  it('is fine for a plain dark crest, which has no detail to lose', () => {
    expect(new Pic(30, 30).rect(5, 5, 20, 20, NAVY).mono().result).toBe('ok')
  })
})
