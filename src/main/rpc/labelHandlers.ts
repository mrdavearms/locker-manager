import type { LabelTemplate } from '@shared/labels'
import {
  deletePrinter,
  getStock,
  labelTemplate,
  listPrinters,
  listStocks,
  resetLabelLayout,
  resetStock,
  saveLabelTemplate,
  savePrinter,
  saveStock
} from '../repos/labels'
import { getTerms } from '../repos/school'
import { buildLabelSheets } from '../render/labelSheet'
import { prepareCalibration, prepareLabels } from '../render/prepare'
import { lockerQrText, qrSvg } from '../render/qr'
import { labelRecords, schoolLogos } from '../repos/labels'
import type { LockerDb } from '../db/db'
import type { Handlers } from './registry'

type Keys =
  | 'labels.stocks'
  | 'labels.stock.save'
  | 'labels.stock.reset'
  | 'labels.template.get'
  | 'labels.template.set'
  | 'labels.template.reset'
  | 'labels.printers.list'
  | 'labels.printers.save'
  | 'labels.printers.delete'
  | 'labels.preview'
  | 'labels.calibrationPreview'

/** A preview with an unsaved template (the designer), or the saved one. */
function previewWith(
  db: LockerDb,
  template: LabelTemplate | undefined,
  selection: Parameters<typeof prepareLabels>[1]['selection'],
  startAt: number
) {
  if (!template) return prepareLabels(db, { selection, startAt, printer: null, outlines: true })
  const stock = getStock(db, template.stockId)
  const records = labelRecords(db, selection, template.usePreferredName)
  const qr = new Map<string, string>()
  if (template.elements.some((e) => e.type === 'qr'))
    for (const r of records) qr.set(r.lockerId, qrSvg(lockerQrText(r.qrId)))
  const out = buildLabelSheets({
    stock,
    template,
    records,
    startAt,
    offset: { right: 0, down: 0 },
    terms: getTerms(db),
    logo: schoolLogos(db),
    qr,
    outlines: true
  })
  return { ...out, stock, lockerIds: records.map((r) => r.lockerId) }
}

export const labelHandlers: Pick<Handlers, Keys> = {
  'labels.stocks': { kind: 'read', run: (db) => listStocks(db) },
  'labels.stock.save': {
    kind: 'write',
    audit: (p) => ({ action: 'labels.stock_measured', entity: 'settings', after: p.stock }),
    run: (db, ctx, p) => {
      saveStock(db, ctx, p.stock)
      return listStocks(db)
    }
  },
  'labels.stock.reset': {
    kind: 'write',
    audit: (p) => ({ action: 'labels.stock_reset', entity: 'settings', entityId: p.id }),
    run: (db, ctx, p) => {
      resetStock(db, ctx, p.id)
      return listStocks(db)
    }
  },
  'labels.template.get': { kind: 'read', run: (db) => labelTemplate(db) },
  'labels.template.set': {
    kind: 'write',
    audit: (p) => ({
      action: 'labels.template_saved',
      entity: 'label_template',
      entityId: 'default',
      after: { stockId: p.template.stockId, colour: p.template.colour }
    }),
    run: (db, ctx, p) => saveLabelTemplate(db, ctx, p.template)
  },
  'labels.template.reset': {
    kind: 'write',
    audit: () => ({ action: 'labels.layout_reset', entity: 'label_template', entityId: 'default' }),
    run: (db, ctx) => resetLabelLayout(db, ctx)
  },
  'labels.printers.list': { kind: 'read', run: (db) => listPrinters(db) },
  'labels.printers.save': {
    kind: 'write',
    audit: (p) => ({ action: 'labels.printer_saved', entity: 'settings', after: p.printer }),
    run: (db, ctx, p) => {
      savePrinter(db, ctx, p.printer)
      return listPrinters(db)
    }
  },
  'labels.printers.delete': {
    kind: 'write',
    audit: (p) => ({ action: 'labels.printer_removed', entity: 'settings', entityId: p.name }),
    run: (db, ctx, p) => {
      deletePrinter(db, ctx, p.name)
      return listPrinters(db)
    }
  },
  'labels.preview': {
    kind: 'read',
    run: (db, p) => {
      const out = previewWith(db, p.template, p.selection, p.startAt)
      return {
        html: out.html,
        sheets: out.sheets,
        labels: out.placed.length,
        tooLong: out.tooLong,
        stock: out.stock
      }
    }
  },
  'labels.calibrationPreview': {
    kind: 'read',
    run: (db, p) => ({ html: prepareCalibration(db, p.stockId, p.printer).html })
  }
}
