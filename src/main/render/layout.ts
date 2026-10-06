import type { LabelElement, LabelTemplate, Stock } from '@shared/labels'

// Default label layouts. "Layout A" is the one WHS settled on for 99.1 × 38 mm
// labels: logo on the left, first name over surname, a rule, the group bottom left
// and LOCKER and number bottom right, inside a 5 mm clear edge. It is scaled to
// other label sizes; small labels get a compact layout without the logo.

function el(
  partial: Partial<LabelElement> & Pick<LabelElement, 'id' | 'type' | 'x' | 'y' | 'w' | 'h'>
): LabelElement {
  return {
    fontMax: 12,
    fontMin: 7,
    bold: true,
    align: 'left',
    nameMode: 'stacked',
    showWord: false,
    text: '',
    ...partial
  }
}

const REF = { w: 99.1, h: 38 }

const LAYOUT_A: LabelElement[] = [
  el({ id: 'logo', type: 'logo', x: 5, y: 5, w: 22, h: 28 }),
  el({ id: 'name', type: 'name', x: 31, y: 5, w: 63.1, h: 16.5, fontMax: 22, fontMin: 9 }),
  el({ id: 'rule', type: 'rule', x: 31, y: 22.6, w: 63.1, h: 0.4 }),
  el({ id: 'group', type: 'group', x: 31, y: 25, w: 30, h: 8, fontMax: 14, fontMin: 8 }),
  el({
    id: 'number',
    type: 'lockerNumber',
    x: 61,
    y: 25,
    w: 33.1,
    h: 8,
    fontMax: 16,
    fontMin: 8,
    align: 'right',
    showWord: true
  })
]

const COMPACT: LabelElement[] = [
  el({
    id: 'number',
    type: 'lockerNumber',
    x: 2,
    y: 1.5,
    w: 34.1,
    h: 6,
    fontMax: 13,
    fontMin: 7,
    align: 'right',
    showWord: false
  }),
  el({ id: 'name', type: 'name', x: 2, y: 7.5, w: 34.1, h: 9, fontMax: 11, fontMin: 6 }),
  el({
    id: 'group',
    type: 'group',
    x: 2,
    y: 16.5,
    w: 34.1,
    h: 3.5,
    fontMax: 8,
    fontMin: 6,
    bold: false
  })
]
const COMPACT_REF = { w: 38.1, h: 21.2 }

function scale(
  elements: readonly LabelElement[],
  from: { w: number; h: number },
  to: { w: number; h: number }
): LabelElement[] {
  const sx = to.w / from.w
  const sy = to.h / from.h
  const sf = Math.min(sx, sy)
  const r = (n: number): number => Math.round(n * 10) / 10
  return elements.map((e) => ({
    ...e,
    x: r(e.x * sx),
    y: r(e.y * sy),
    w: r(e.w * sx),
    h: e.type === 'rule' ? e.h : r(e.h * sy),
    fontMax: Math.max(6, Math.round(e.fontMax * sf * 2) / 2),
    fontMin: Math.max(5, Math.round(e.fontMin * sf * 2) / 2)
  }))
}

export function defaultLayout(stock: Stock): LabelElement[] {
  const size = { w: stock.labelWidth, h: stock.labelHeight }
  if (stock.labelHeight >= 30 && stock.labelWidth >= 60) return scale(LAYOUT_A, REF, size)
  return scale(COMPACT, COMPACT_REF, size)
}

export function defaultTemplate(stock: Stock): LabelTemplate {
  const compact = !(stock.labelHeight >= 30 && stock.labelWidth >= 60)
  return {
    stockId: stock.id,
    elements: defaultLayout(stock),
    safeMargin: compact ? 1.5 : 5,
    colour: 'mono',
    usePreferredName: true
  }
}

/** Moves a layout to a different label size, keeping proportions. */
export function rescaleTemplate(t: LabelTemplate, from: Stock, to: Stock): LabelTemplate {
  return {
    ...t,
    stockId: to.id,
    elements: scale(
      t.elements,
      { w: from.labelWidth, h: from.labelHeight },
      { w: to.labelWidth, h: to.labelHeight }
    )
  }
}

/** Elements that reach into the clear edge, for the designer to warn about. */
export function outsideSafeArea(t: LabelTemplate, stock: Stock): string[] {
  const m = t.safeMargin
  return t.elements
    .filter((e) => e.type !== 'rule' || e.w > 0)
    .filter(
      (e) =>
        e.x < m - 0.05 ||
        e.y < m - 0.05 ||
        e.x + e.w > stock.labelWidth - m + 0.05 ||
        e.y + e.h > stock.labelHeight - m + 0.05
    )
    .map((e) => e.id)
}
