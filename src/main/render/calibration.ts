import type { Stock } from '@shared/labels'
import { esc, mm } from './html'
import { pageCss } from './labelSheet'
import { labelPosition, labelsPerSheet } from './stocks'

// The calibration page (SPEC.md 5.1): label outlines where the app thinks they
// are, the safe margin drawn in, millimetre rulers along the top and left edges to
// read how far off the printer is, and a 100 mm bar to check it is not scaling.

function ruler(kind: 'top' | 'left', length: number): string {
  const ticks: string[] = []
  for (let i = 0; i <= Math.floor(length); i++) {
    const long = i % 10 === 0
    const mid = i % 5 === 0
    const size = long ? 5 : mid ? 3.5 : 2
    if (kind === 'top')
      ticks.push(
        `<div style="position:absolute;left:${mm(i)};top:0;width:0.15mm;height:${mm(size)};background:#000"></div>`
      )
    else
      ticks.push(
        `<div style="position:absolute;top:${mm(i)};left:0;height:0.15mm;width:${mm(size)};background:#000"></div>`
      )
    if (long && i > 0 && i < length - 3) {
      ticks.push(
        kind === 'top'
          ? `<div style="position:absolute;left:${mm(i + 0.6)};top:${mm(5.2)};font-size:5pt">${i}</div>`
          : `<div style="position:absolute;top:${mm(i + 0.6)};left:${mm(5.2)};font-size:5pt">${i}</div>`
      )
    }
  }
  return ticks.join('')
}

export function buildCalibrationPage(
  stock: Stock,
  offset: { right: number; down: number },
  safeMargin: number,
  stockName: string
): string {
  const labels: string[] = []
  for (let n = 0; n < labelsPerSheet(stock); n++) {
    const p = labelPosition(stock, n)
    const x = p.x + offset.right
    const y = p.y + offset.down
    labels.push(
      `<div class="label" style="left:${mm(x)};top:${mm(y)};outline:0.25mm solid #000;border-radius:${mm(stock.cornerRadius)}">` +
        `<div style="position:absolute;left:${mm(safeMargin)};top:${mm(safeMargin)};right:${mm(safeMargin)};bottom:${mm(safeMargin)};outline:0.15mm dashed #777"></div>` +
        `<div style="position:absolute;left:${mm(safeMargin + 1)};top:${mm(safeMargin + 0.5)};font-size:7pt;font-weight:700">${n + 1}</div>` +
        `</div>`
    )
  }
  const cx = stock.pageWidth / 2 - 50
  const cy = stock.pageHeight / 2
  const bar =
    `<div data-scale-bar style="position:absolute;left:${mm(cx)};top:${mm(cy)};width:100mm;height:3mm;border:0.2mm solid #000;background:repeating-linear-gradient(90deg,#000 0 10mm,#fff 10mm 20mm)"></div>` +
    `<div style="position:absolute;left:${mm(cx)};top:${mm(cy + 4)};width:100mm;text-align:center;font-size:7pt;background:#fff">This bar must measure exactly 100 mm. If it does not, the printer is scaling: choose Actual size (100%), never Fit to page.</div>`
  const note =
    `<div style="position:absolute;left:${mm(12)};top:${mm(cy - 26)};width:${mm(stock.pageWidth - 24)};font-size:8pt;line-height:1.35;background:#fff;padding:2mm;border:0.2mm solid #000">` +
    `<b>Calibration page: ${esc(stockName)}</b><br>1. Print this on plain paper at Actual size. 2. Lay it on a sheet of labels and hold both up to a window. ` +
    `3. If the outlines sit to the right of the real labels, set the nudge right to a minus number (and so on), using the rulers at the edges. ` +
    `Nudge right ${offset.right} mm, down ${offset.down} mm. Dashed lines show the ${safeMargin} mm clear edge.</div>`
  return (
    `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><title>Calibration</title><style>${pageCss(stock)}</style></head><body><div class="page">` +
    `<div style="position:absolute;left:0;top:0;width:100%;height:9mm">${ruler('top', stock.pageWidth)}</div>` +
    `<div style="position:absolute;left:0;top:0;height:100%;width:9mm">${ruler('left', stock.pageHeight)}</div>` +
    labels.join('') +
    note +
    bar +
    `</div></body></html>`
  )
}
