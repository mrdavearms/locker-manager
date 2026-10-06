import type { LabelSelection, Stock } from '@shared/labels'
import type { LockerDb } from '../db/db'
import { getTerms } from '../repos/school'
import { getStock, labelRecords, labelTemplate, printerOffset, schoolLogos } from '../repos/labels'
import { buildCalibrationPage } from './calibration'
import { buildLabelSheets, type SheetOutput } from './labelSheet'
import { lockerQrText, qrSvg } from './qr'

export interface PreparedLabels extends SheetOutput {
  stock: Stock
  lockerIds: string[]
}

/** Everything needed to show, save or print labels, from the open file. */
export function prepareLabels(
  db: LockerDb,
  opts: { selection: LabelSelection; startAt: number; printer: string | null; outlines: boolean }
): PreparedLabels {
  const template = labelTemplate(db)
  const stock = getStock(db, template.stockId)
  const records = labelRecords(db, opts.selection, template.usePreferredName)
  const qr = new Map<string, string>()
  if (template.elements.some((e) => e.type === 'qr'))
    for (const r of records) qr.set(r.lockerId, qrSvg(lockerQrText(r.qrId)))
  const out = buildLabelSheets({
    stock,
    template,
    records,
    startAt: opts.startAt,
    // The preview shows labels where they belong on the stock; the nudge applies to printing.
    offset: opts.outlines ? { right: 0, down: 0 } : printerOffset(db, opts.printer),
    terms: getTerms(db),
    logo: schoolLogos(db),
    qr,
    outlines: opts.outlines
  })
  return { ...out, stock, lockerIds: records.map((r) => r.lockerId) }
}

export function prepareCalibration(
  db: LockerDb,
  stockId: string | null,
  printer: string | null
): { html: string; stock: Stock } {
  const template = labelTemplate(db)
  const stock = getStock(db, stockId ?? template.stockId)
  return {
    html: buildCalibrationPage(stock, printerOffset(db, printer), template.safeMargin, stock.name),
    stock
  }
}
