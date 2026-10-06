import { describe, expect, it } from 'vitest'
import type { LabelRecord, Stock } from '../../src/shared/labels'
import { DEFAULT_TERMS } from '../../src/shared/terminology'
import { buildCalibrationPage } from '../../src/main/render/calibration'
import { fitText } from '../../src/main/render/fit'
import { textWidthMm } from '../../src/main/render/fonts'
import { buildLabelSheets } from '../../src/main/render/labelSheet'
import { defaultTemplate, outsideSafeArea, rescaleTemplate } from '../../src/main/render/layout'
import { BUILT_IN_STOCKS, labelPosition, stockProblems } from '../../src/main/render/stocks'

const L7163 = BUILT_IN_STOCKS.find((s) => s.id === 'avery-l7163')!
// WHS measured its L7163EV box: 38.0 mm high, first row 14.0 mm from the top (SPEC.md 5.1).
const MEASURED: Stock = { ...L7163, labelHeight: 38.0, top: 14.0, pitchY: 38.0 }

function rec(
  n: number,
  first = 'Ava',
  last = 'Nguyen',
  status: LabelRecord['status'] = 'assigned'
): LabelRecord {
  return {
    lockerId: `l${n}`,
    number: String(n),
    area: 'Year 7 side',
    bank: 'North wall',
    qrId: 'Q',
    status,
    firstName: first,
    lastName: last,
    group: '7A',
    yearLevel: '7'
  }
}

function build(
  stock: Stock,
  records: LabelRecord[],
  extra: Partial<Parameters<typeof buildLabelSheets>[0]> = {}
) {
  return buildLabelSheets({
    stock,
    template: defaultTemplate(stock),
    records,
    startAt: 1,
    offset: { right: 0, down: 0 },
    terms: DEFAULT_TERMS,
    logo: { colour: null, mono: null },
    qr: new Map(),
    outlines: false,
    ...extra
  })
}

describe('stock geometry (SPEC.md 5.1)', () => {
  it('every built-in stock fits its page without overlaps', () => {
    for (const s of BUILT_IN_STOCKS) expect(stockProblems(s), s.id).toEqual([])
  })
  it('places Avery L7163 labels at the published millimetres', () => {
    expect(labelPosition(L7163, 0)).toEqual({ x: 4.65, y: 15.15 })
    expect(labelPosition(L7163, 1)).toEqual({ x: 4.65 + 101.6, y: 15.15 })
    expect(labelPosition(L7163, 13).y).toBeCloseTo(15.15 + 6 * 38.1, 6)
    expect(labelPosition(L7163, 14)).toEqual({ x: 4.65, y: 15.15 })
  })
  it('measured values override published ones (section 15, item 7)', () => {
    expect(labelPosition(MEASURED, 13).y).toBeCloseTo(14 + 6 * 38, 6)
  })
  it('finds a stock that runs off the page', () => {
    expect(stockProblems({ ...L7163, top: 40 })).toContain('The bottom labels run off the page.')
  })
})

describe('label sheets', () => {
  it('put each label at exact millimetres, with printer offsets', () => {
    const out = build(MEASURED, [rec(1), rec(2), rec(3)], { offset: { right: 0.5, down: -0.3 } })
    expect(out.placed.map((p) => [p.number, p.x, p.y])).toEqual([
      ['1', 5.15, 13.7],
      ['2', 4.65 + 101.6 + 0.5, 13.7],
      ['3', 5.15, 13.7 + 38]
    ])
    expect(out.html).toContain('left:5.15mm;top:13.7mm')
    expect(out.html).toContain('@page { size: 210mm 297mm; margin: 0 }')
  })
  it('start part-way down a used sheet', () => {
    const out = build(L7163, [rec(1), rec(2)], { startAt: 13 })
    expect(
      out.placed.map((p) => [
        p.page,
        labelPosition(L7163, 12).y === p.y || labelPosition(L7163, 13).y === p.y
      ])
    ).toEqual([
      [0, true],
      [0, true]
    ])
    expect(build(L7163, [rec(1), rec(2), rec(3)], { startAt: 13 }).sheets).toBe(2)
  })
  it('make one page per 14 labels', () => {
    expect(
      build(
        L7163,
        Array.from({ length: 29 }, (_, i) => rec(i + 1))
      ).sheets
    ).toBe(3)
  })
  it('print spare and out-of-service labels without a name', () => {
    const out = build(L7163, [rec(5, '', '', 'spare'), rec(6, '', '', 'out_of_service')])
    expect(out.html).toContain('Spare locker')
    expect(out.html).toContain('Out of service')
  })
  it('escape names (no HTML from a student system reaches the page)', () => {
    const out = build(L7163, [rec(1, '<b>Ava</b>', "O'Brien & Co")])
    expect(out.html).toContain('&lt;b&gt;Ava&lt;/b&gt;')
    expect(out.html).toContain('O&#39;Brien &amp; Co')
  })
  it('keep every element inside the 5 mm clear edge', () => {
    const t = defaultTemplate(L7163)
    expect(t.safeMargin).toBe(5)
    expect(outsideSafeArea(t, L7163)).toEqual([])
  })
  it('scale Layout A to another stock', () => {
    const big = BUILT_IN_STOCKS.find((s) => s.id === 'avery-l7165')!
    const t = rescaleTemplate(defaultTemplate(L7163), L7163, big)
    expect(t.stockId).toBe('avery-l7165')
    const logo = t.elements.find((e) => e.type === 'logo')!
    expect(logo.h).toBeGreaterThan(40)
  })
})

describe('auto-fit with real glyph widths (section 15, item 8)', () => {
  it('measures real widths: a W is wider than an i', () => {
    expect(textWidthMm('WWWW', 12, 700)).toBeGreaterThan(textWidthMm('iiii', 12, 700) * 2)
  })
  it('shrinks a long name until it fits, never below the minimum', () => {
    const short = fitText('Ava', { w: 63, h: 10 }, { max: 22, min: 9 }, 700)
    const long = fitText('Wickramasinghe Arachchige', { w: 63, h: 10 }, { max: 22, min: 9 }, 700)
    expect(short.sizePt).toBe(22)
    expect(long.sizePt).toBeLessThan(22)
    expect(long.sizePt).toBeGreaterThanOrEqual(9)
    expect(textWidthMm(long.lines[0]!, long.sizePt, 700)).toBeLessThanOrEqual(63)
  })
  it('wraps to two lines, then flags a name that still does not fit', () => {
    const two = fitText('Kushini Siddi Arachchige', { w: 30, h: 16 }, { max: 14, min: 10 }, 700)
    expect(two.lines).toHaveLength(2)
    expect(two.tooLong).toBe(false)
    const flagged = fitText(
      'Supercalifragilisticexpialidocious',
      { w: 20, h: 8 },
      { max: 14, min: 10 },
      700
    )
    expect(flagged.tooLong).toBe(true)
  })
  it('a too-long name is listed for the preview', () => {
    const out = build(
      BUILT_IN_STOCKS.find((s) => s.id === 'avery-l7651')!,
      [rec(1, 'Kushini', 'Wickramasinghe Arachchige Fitzgerald-Montgomery')]
    )
    expect(out.tooLong.map((t) => t.number)).toEqual(['1'])
  })
  it('measures accented names with the Latin Extended font', () => {
    expect(textWidthMm('Łukasz Wróbel', 12, 700)).toBeGreaterThan(20)
  })
})

describe('calibration page', () => {
  it('draws every label, the clear edge, rulers and a 100 mm bar', () => {
    const html = buildCalibrationPage(MEASURED, { right: 0, down: 0 }, 5, 'L7163EV measured')
    expect((html.match(/class="label"/g) ?? []).length).toBe(14)
    expect(html).toContain('data-scale-bar')
    expect(html).toContain('width:100mm')
    expect(html).toContain('dashed')
    expect(html).toContain('Actual size')
  })
})
