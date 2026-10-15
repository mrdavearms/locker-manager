import { describe, expect, it } from 'vitest'
import type { LabelRecord, Stock } from '../../src/shared/labels'
import { DEFAULT_TERMS } from '../../src/shared/terminology'
import { buildCalibrationPage } from '../../src/main/render/calibration'
import { fitText } from '../../src/main/render/fit'
import { fontFaceCss, textWidthMm } from '../../src/main/render/fonts'
import { buildLabelSheets } from '../../src/main/render/labelSheet'
import { defaultTemplate, outsideSafeArea, rescaleTemplate } from '../../src/main/render/layout'
import { BUILT_IN_STOCKS, labelPosition, stockProblems } from '../../src/main/render/stocks'
import { namedPaper, nearPaperEdge } from '../../src/shared/labelGeometry'
import { lockerIdFromLink } from '../../src/shared/lockerLink'
import { lockerQrText, qrSvg } from '../../src/main/render/qr'
import { quickSearch } from '../../src/main/repos/history'
import {
  getStock,
  labelRecords,
  listStocks,
  recordLabelPrint,
  resetStock,
  saveStock
} from '../../src/main/repos/labels'
import { prepareLabels } from '../../src/main/render/prepare'
import { updateStudent } from '../../src/main/repos/students'
import { allocatedDemo } from './fixtures'

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

describe('font coverage (print audit M4)', () => {
  it('embeds Arimo for Vietnamese, Greek, Cyrillic and Hebrew', () => {
    const css = fontFaceCss()
    for (const range of ['U+1EA0-1EF9', 'U+0370-0377', 'U+0400-045F', 'U+0590-05FF'])
      expect(css).toContain(range)
  })
  it('measures those letters with real glyphs, close to their Latin look-alikes', () => {
    // Cyrillic "А" and Greek "Α" are drawn like Latin "A" in Arimo.
    const a = textWidthMm('A', 12, 400)
    expect(textWidthMm('А', 12, 400)).toBeCloseTo(a, 3)
    expect(textWidthMm('Α', 12, 400)).toBeCloseTo(a, 3)
    expect(textWidthMm('ạ', 12, 400)).toBeCloseTo(textWidthMm('a', 12, 400), 3)
  })
  it('gives a full em to characters the app has no font for, so they are never under-measured', () => {
    const em = (12 * 25.4) / 72
    expect(textWidthMm('张伟', 12, 400)).toBeCloseTo(2 * em, 3)
  })
})

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
  it('report words other than the name that are cut off, and keep their start (audit M1)', () => {
    const terms = {
      ...DEFAULT_TERMS,
      locker: { one: 'Learning Community Locker', many: 'Learning Community Lockers' }
    }
    const out = build(L7163, [rec(1000)], { terms })
    const long = out.tooLong.find((t) => t.what === 'Locker number')
    expect(long).toMatchObject({ number: '1000', name: 'LEARNING COMMUNITY LOCKER 1000' })
    // Right-aligned text that does not fit starts at the left, so its start shows.
    const el = out.html.match(/<div class="el"[^>]*><span>LEARNING COMMUNITY LOCKER 1000/)![0]
    expect(el).toContain('align-items:flex-start')
  })
  it('carry the logo once per page, however many labels there are', () => {
    const logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='
    const records = Array.from({ length: 40 }, (_, i) => rec(i + 1))
    const out = build(L7163, records, { logo: { colour: null, mono: logo } })
    expect(out.html.split(logo).length - 1).toBe(1)
    expect(out.html.match(/class="el logo"/g)).toHaveLength(40)
  })
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
  it('keeps every ruler mark at least 6 mm from the paper edge, where lasers print (audit M9)', () => {
    const html = buildCalibrationPage(MEASURED, { right: 0, down: 0 }, 5, 'L7163EV measured')
    const marks = [
      ...html.matchAll(/(left|top):([\d.]+)mm;(top|left):([\d.]+)mm;(width|height):0\.2mm/g)
    ]
    expect(marks.length).toBeGreaterThan(400)
    for (const m of marks) {
      expect(Number(m[2])).toBeGreaterThanOrEqual(6)
      expect(Number(m[4])).toBeGreaterThanOrEqual(6)
    }
  })
})

describe('paper by name (print audit M7)', () => {
  it('names A4 and US Letter pages, and leaves other sizes custom', () => {
    expect(namedPaper(210, 297)).toBe('A4')
    expect(namedPaper(215.9, 279.4)).toBe('Letter')
    expect(namedPaper(100, 150)).toBeNull()
    for (const s of BUILT_IN_STOCKS)
      expect(namedPaper(s.pageWidth, s.pageHeight), s.id).not.toBeNull()
  })
})

describe('QR codes (print audit M10)', () => {
  it('carry a clear border four squares wide, on white', () => {
    const svg = qrSvg(lockerQrText('AbC123xy'))
    const size = Number(/viewBox="0 0 (\d+) /.exec(svg)![1])
    expect(size).toBe(29 + 8)
    expect(svg).toContain('<rect width="37" height="37" fill="#fff"/>')
    // The first dark square starts four squares in.
    expect(svg).toMatch(/<path d="M4 4h1v1h-1z/)
  })
  it('are found by quick find from the link a scanner types', async () => {
    const { db } = await allocatedDemo()
    const row = db.get<{ id: string; qr_id: string; number: string }>(
      'SELECT id, qr_id, number FROM locker WHERE qr_id IS NOT NULL LIMIT 1'
    )!
    const found = quickSearch(db, `lockermanager://locker/${row.qr_id}`)
    expect(found[0]).toMatchObject({ kind: 'locker', id: row.id, title: `Locker ${row.number}` })
    expect(lockerIdFromLink('LOCKERMANAGER://locker/AbC123xy/')).toBe('AbC123xy')
    expect(lockerIdFromLink('https://example.com/locker/AbC123xy')).toBeNull()
  })
})

describe('words near the paper edge (print audit, Low)', () => {
  it('finds no problem on the built-in sheets with the standard layout', () => {
    for (const s of BUILT_IN_STOCKS)
      expect(nearPaperEdge(s, { right: 0, down: 0 }, defaultTemplate(s).safeMargin), s.id).toEqual(
        []
      )
  })
  it('warns when a nudge pushes words into the edge printers cannot reach', () => {
    expect(nearPaperEdge(L7163, { right: -6, down: 0 }, 5)).toEqual(['left'])
    expect(nearPaperEdge(L7163, { right: 0, down: 20 }, 5)).toEqual(['bottom'])
  })
})

describe('labels changed since they were last printed (spec audit gap 5)', () => {
  const due = (db: Parameters<typeof labelRecords>[0]): string[] =>
    labelRecords(db, { mode: 'changed' }, true).map((r) => r.number)

  it('is per locker, and sees a name, preferred name or group change', async () => {
    const { db, ctx } = await allocatedDemo()
    const all = labelRecords(db, { mode: 'all' }, true)
    expect(due(db)).toHaveLength(all.length)
    recordLabelPrint(db, ctx, all)
    expect(due(db)).toEqual([])

    const held = all.filter((r) => r.status === 'assigned')
    const [a, b, c, d] = held.map((r) => ({
      number: r.number,
      student: db.get<{ student_id: string }>(
        "SELECT student_id FROM assignment WHERE locker_id = $l AND status = 'current'",
        { $l: r.lockerId }
      )!.student_id
    }))
    ctx.advance(60_000)
    updateStudent(db, ctx, a!.student, { firstName: 'Synthetica' })
    updateStudent(db, ctx, b!.student, { preferredName: 'Syn' })
    updateStudent(db, ctx, c!.student, { groupCode: '09Z' })
    expect(due(db)).toEqual([a!.number, b!.number, c!.number])

    // Printing one other locker does not hide the others still waiting.
    ctx.advance(60_000)
    recordLabelPrint(db, ctx, labelRecords(db, { mode: 'lockers', numbers: d!.number }, true))
    expect(due(db)).toEqual([a!.number, b!.number, c!.number])

    // Printing one of them takes only that one off the list.
    ctx.advance(60_000)
    recordLabelPrint(db, ctx, labelRecords(db, { mode: 'lockers', numbers: a!.number }, true))
    expect(due(db)).toEqual([b!.number, c!.number])
  })
})

describe("a school's measured label sizes (spec audit gap 9)", () => {
  it('are saved, read back and used for printing, and can be put back to the published sizes', async () => {
    const { db, ctx } = await allocatedDemo()
    saveStock(db, ctx, MEASURED)
    const got = getStock(db, MEASURED.id)
    expect(got).toMatchObject({ top: 14.0, labelHeight: 38.0, pitchY: 38.0 })
    expect(listStocks(db).find((s) => s.id === MEASURED.id)).toMatchObject({ top: 14.0 })

    // Labels print from the measured top: the first label sits 14.0 mm down.
    const out = prepareLabels(db, {
      selection: { mode: 'lockers', numbers: '1' },
      startAt: 1,
      printer: null,
      outlines: false
    })
    expect(out.placed[0]!.y).toBeCloseTo(14.0, 3)
    expect(out.html).toContain('top:14mm')

    resetStock(db, ctx, MEASURED.id)
    expect(getStock(db, MEASURED.id).top).toBe(L7163.top)
  })
})
