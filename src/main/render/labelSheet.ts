import type { LabelElement, LabelRecord, LabelTemplate, Stock } from '@shared/labels'
import type { Terminology } from '@shared/terminology'
import { fitText } from './fit'
import { fontFaceCss, LINE_HEIGHT } from './fonts'
import { esc, mm, safeImageUrl } from './html'
import { labelPosition, labelsPerSheet } from './stocks'

// Label sheets as HTML at exact millimetre geometry (SPEC.md 5.1 and 5.3). Every
// position is absolute in mm; Chromium prints it with @page margin 0, so a PDF
// printed at Actual size puts each label where the stock says it is.

export interface SheetInput {
  stock: Stock
  template: LabelTemplate
  records: readonly LabelRecord[]
  /** 1-based slot on the first sheet to start at (for a part-used sheet). */
  startAt: number
  offset: { right: number; down: number }
  terms: Terminology
  logo: { colour: string | null; mono: string | null }
  qr: ReadonlyMap<string, string>
  /** Draw label outlines (preview only; never on the printed PDF). */
  outlines: boolean
}

export interface PlacedLabel {
  lockerId: string
  number: string
  page: number
  x: number
  y: number
}

export interface SheetOutput {
  html: string
  sheets: number
  placed: PlacedLabel[]
  tooLong: { number: string; name: string }[]
}

function clampToSafe(e: LabelElement, stock: Stock, margin: number): LabelElement {
  const x = Math.max(margin, e.x)
  const y = Math.max(margin, e.y)
  const w = Math.max(0.5, Math.min(e.x + e.w, stock.labelWidth - margin) - x)
  const h = Math.max(0.2, Math.min(e.y + e.h, stock.labelHeight - margin) - y)
  return { ...e, x, y, w, h }
}

function textBlock(e: LabelElement, lines: string[], sizePt: number, extraStyle = ''): string {
  const justify = e.align === 'right' ? 'flex-end' : e.align === 'center' ? 'center' : 'flex-start'
  return `<div class="el" style="left:${mm(e.x)};top:${mm(e.y)};width:${mm(e.w)};height:${mm(e.h)};font-size:${sizePt}pt;font-weight:${e.bold ? 700 : 400};text-align:${e.align};justify-content:center;align-items:${justify};${extraStyle}">${lines
    .map((l) => `<span>${esc(l)}</span>`)
    .join('')}</div>`
}

function renderElement(
  e: LabelElement,
  r: LabelRecord,
  input: SheetInput,
  tooLong: SheetOutput['tooLong']
): string {
  const weight = e.bold ? 700 : 400
  const terms = input.terms
  const fit = (text: string, box = { w: e.w, h: e.h }, twoLines = true) =>
    fitText(text, box, { max: e.fontMax, min: e.fontMin }, weight, twoLines)
  switch (e.type) {
    case 'logo': {
      const src = safeImageUrl(
        input.template.colour === 'mono'
          ? (input.logo.mono ?? input.logo.colour)
          : (input.logo.colour ?? input.logo.mono)
      )
      return src
        ? `<img class="el logo" src="${esc(src)}" style="left:${mm(e.x)};top:${mm(e.y)};width:${mm(e.w)};height:${mm(e.h)}" alt="">`
        : ''
    }
    case 'name': {
      if (r.status !== 'assigned') {
        const text =
          r.status === 'spare' ? `Spare ${terms.locker.one.toLowerCase()}` : 'Out of service'
        const f = fit(text)
        return textBlock(e, f.lines, f.sizePt)
      }
      const first = r.firstName ?? ''
      const last = r.lastName ?? ''
      if (e.nameMode === 'one_line') {
        const f = fit(`${first} ${last}`.trim())
        if (f.tooLong) tooLong.push({ number: r.number, name: `${first} ${last}` })
        return textBlock(e, f.lines, f.sizePt)
      }
      // Stacked: each name gets half the box and its own size, then both use the smaller.
      const half = { w: e.w, h: e.h / 2 }
      const a = fit(first, half, false)
      const b = fit(last, half, false)
      if (a.tooLong || b.tooLong) tooLong.push({ number: r.number, name: `${first} ${last}` })
      const size = Math.min(a.sizePt, b.sizePt)
      return `<div class="el" style="left:${mm(e.x)};top:${mm(e.y)};width:${mm(e.w)};height:${mm(e.h)};font-weight:${weight};text-align:${e.align};justify-content:space-around;font-size:${size}pt"><span>${esc(first)}</span><span>${esc(last)}</span></div>`
    }
    case 'group': {
      if (!r.group || r.status !== 'assigned') return ''
      const f = fit(r.group, undefined, false)
      return textBlock(e, f.lines, f.sizePt)
    }
    case 'yearLevel': {
      if (!r.yearLevel || r.status !== 'assigned') return ''
      const f = fit(`${terms.yearLevel.one} ${r.yearLevel}`, undefined, false)
      return textBlock(e, f.lines, f.sizePt)
    }
    case 'lockerNumber': {
      const text = e.showWord ? `${terms.locker.one.toUpperCase()} ${r.number}` : r.number
      const f = fit(text, undefined, false)
      return textBlock(e, f.lines, f.sizePt)
    }
    case 'area': {
      const f = fit(r.area, undefined, false)
      return textBlock(e, f.lines, f.sizePt)
    }
    case 'bank': {
      const f = fit(r.bank, undefined, false)
      return textBlock(e, f.lines, f.sizePt)
    }
    case 'rule':
      return `<div class="rule" style="left:${mm(e.x)};top:${mm(e.y)};width:${mm(e.w)};height:${mm(Math.max(0.2, e.h))}"></div>`
    case 'qr': {
      const svg = input.qr.get(r.lockerId)
      return svg
        ? `<div class="el qr" style="left:${mm(e.x)};top:${mm(e.y)};width:${mm(Math.min(e.w, e.h))};height:${mm(Math.min(e.w, e.h))}">${svg}</div>`
        : ''
    }
    case 'text': {
      if (!e.text.trim()) return ''
      const f = fit(e.text)
      return textBlock(e, f.lines, f.sizePt)
    }
  }
}

export function pageCss(stock: Stock): string {
  return `${fontFaceCss()}
@page { size: ${mm(stock.pageWidth)} ${mm(stock.pageHeight)}; margin: 0 }
* { box-sizing: border-box }
html, body { margin: 0; padding: 0; background: #fff; color: #000 }
body { font-family: LMArimo, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact }
.page { position: relative; width: ${mm(stock.pageWidth)}; height: ${mm(stock.pageHeight)}; overflow: hidden; page-break-after: always; break-after: page }
.page:last-child { page-break-after: auto; break-after: auto }
.label { position: absolute; width: ${mm(stock.labelWidth)}; height: ${mm(stock.labelHeight)}; overflow: hidden }
.label.outline { outline: 0.2mm solid #b9c4cc; border-radius: ${mm(stock.cornerRadius)} }
.el { position: absolute; display: flex; flex-direction: column; white-space: nowrap; overflow: hidden; line-height: ${LINE_HEIGHT} }
.logo { object-fit: contain; object-position: left center }
.rule { position: absolute; background: #000 }
.qr svg { width: 100%; height: 100% }`
}

export function buildLabelSheets(input: SheetInput): SheetOutput {
  const { stock, template } = input
  const perSheet = labelsPerSheet(stock)
  const skip = Math.max(0, Math.min(perSheet - 1, input.startAt - 1))
  const elements = template.elements.map((e) => clampToSafe(e, stock, template.safeMargin))
  const pages: string[][] = []
  const placed: PlacedLabel[] = []
  const tooLong: SheetOutput['tooLong'] = []
  input.records.forEach((r, i) => {
    const slot = i + skip
    const page = Math.floor(slot / perSheet)
    const pos = labelPosition(stock, slot)
    const x = pos.x + input.offset.right
    const y = pos.y + input.offset.down
    ;(pages[page] ??= []).push(
      `<div class="label${input.outlines ? ' outline' : ''}" data-locker="${esc(r.number)}" style="left:${mm(x)};top:${mm(y)}">${elements.map((e) => renderElement(e, r, input, tooLong)).join('')}</div>`
    )
    placed.push({ lockerId: r.lockerId, number: r.number, page, x, y })
  })
  if (pages.length === 0) pages.push([])
  // A preview of a part-used sheet shows the used slots greyed.
  if (input.outlines && skip > 0) {
    for (let s = 0; s < skip; s++) {
      const pos = labelPosition(stock, s)
      pages[0]!.unshift(
        `<div class="label outline" style="left:${mm(pos.x + input.offset.right)};top:${mm(pos.y + input.offset.down)};background:repeating-linear-gradient(45deg,#eee 0 2mm,#fff 2mm 4mm)"></div>`
      )
    }
  }
  const html = `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><title>Labels</title><style>${pageCss(stock)}</style></head><body>${pages
    .map((p) => `<div class="page">${p.join('')}</div>`)
    .join('')}</body></html>`
  return { html, sheets: pages.length, placed, tooLong }
}
