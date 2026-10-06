import type { Stock } from '@shared/labels'

// Published geometry of common label sheets (SPEC.md 5.1), from the makers'
// templates. A school's own measurements override these: at WHS, Avery L7163EV
// measured 38.0 mm high starting 14.0 mm from the top, not the published 38.1
// and 15.1, and labels printed to the published figures came out low.

const A4 = { pageWidth: 210, pageHeight: 297 }
const LETTER = { pageWidth: 215.9, pageHeight: 279.4 }

export const BUILT_IN_STOCKS: readonly Stock[] = [
  {
    id: 'avery-l7163',
    name: 'Avery L7163 / J8163 (14 per sheet, 99.1 × 38.1 mm)',
    ...A4,
    labelWidth: 99.1,
    labelHeight: 38.1,
    columns: 2,
    rows: 7,
    top: 15.15,
    left: 4.65,
    pitchX: 101.6,
    pitchY: 38.1,
    cornerRadius: 2
  },
  {
    id: 'avery-l7160',
    name: 'Avery L7160 (21 per sheet, 63.5 × 38.1 mm)',
    ...A4,
    labelWidth: 63.5,
    labelHeight: 38.1,
    columns: 3,
    rows: 7,
    top: 15.15,
    left: 7.2,
    pitchX: 66.0,
    pitchY: 38.1,
    cornerRadius: 2
  },
  {
    id: 'avery-l7161',
    name: 'Avery L7161 (18 per sheet, 63.5 × 46.6 mm)',
    ...A4,
    labelWidth: 63.5,
    labelHeight: 46.6,
    columns: 3,
    rows: 6,
    top: 8.8,
    left: 7.2,
    pitchX: 66.0,
    pitchY: 46.6,
    cornerRadius: 2
  },
  {
    id: 'avery-l7162',
    name: 'Avery L7162 (16 per sheet, 99.1 × 33.9 mm)',
    ...A4,
    labelWidth: 99.1,
    labelHeight: 33.9,
    columns: 2,
    rows: 8,
    top: 12.9,
    left: 4.65,
    pitchX: 101.6,
    pitchY: 33.9,
    cornerRadius: 2
  },
  {
    id: 'avery-l7165',
    name: 'Avery L7165 (8 per sheet, 99.1 × 67.7 mm)',
    ...A4,
    labelWidth: 99.1,
    labelHeight: 67.7,
    columns: 2,
    rows: 4,
    top: 13.1,
    left: 4.65,
    pitchX: 101.6,
    pitchY: 67.7,
    cornerRadius: 2
  },
  {
    id: 'avery-l7651',
    name: 'Avery L7651 (65 per sheet, 38.1 × 21.2 mm)',
    ...A4,
    labelWidth: 38.1,
    labelHeight: 21.2,
    columns: 5,
    rows: 13,
    top: 10.7,
    left: 4.75,
    pitchX: 40.6,
    pitchY: 21.2,
    cornerRadius: 1
  },
  {
    id: 'avery-5160',
    name: 'Avery 5160 US Letter (30 per sheet, 2⅝ × 1 in)',
    ...LETTER,
    labelWidth: 66.675,
    labelHeight: 25.4,
    columns: 3,
    rows: 10,
    top: 12.7,
    left: 4.7625,
    pitchX: 69.85,
    pitchY: 25.4,
    cornerRadius: 1.5
  },
  {
    id: 'avery-5163',
    name: 'Avery 5163 US Letter (10 per sheet, 4 × 2 in)',
    ...LETTER,
    labelWidth: 101.6,
    labelHeight: 50.8,
    columns: 2,
    rows: 5,
    top: 12.7,
    left: 3.96875,
    pitchX: 106.3625,
    pitchY: 50.8,
    cornerRadius: 1.5
  }
]

export { labelPosition, labelsPerSheet, stockProblems } from '@shared/labelGeometry'
