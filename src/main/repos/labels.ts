import { z } from 'zod'
import {
  LabelTemplateSchema,
  PrinterOffsetSchema,
  StockSchema,
  type LabelRecord,
  type LabelSelection,
  type LabelTemplate,
  type PrinterOffset,
  type Stock,
  type StockView
} from '@shared/labels'
import type { LockerDb } from '../db/db'
import { newId, stamp, type OperatorContext } from '../db/context'
import { displayGroup } from '../import/groups'
import { compareLockerNumbers } from '../locations/lockerNumbers'
import { defaultTemplate, rescaleTemplate } from '../render/layout'
import { BUILT_IN_STOCKS } from '../render/stocks'
import { getSchoolProfile } from './school'
import { getSetting, setSetting } from './settings'
import { groupMap } from './students'

const StockMap = z.record(z.string(), StockSchema)
const StockList = z.array(StockSchema)
const Printers = z.array(PrinterOffsetSchema)

export function listStocks(db: LockerDb): StockView[] {
  const measured = getSetting(db, 'labels.measured', StockMap, {})
  const custom = getSetting(db, 'labels.customStocks', StockList, [])
  return [
    ...BUILT_IN_STOCKS.map((s) => ({
      ...(measured[s.id] ?? s),
      id: s.id,
      name: s.name,
      builtIn: true,
      measured: measured[s.id] !== undefined,
      published: s
    })),
    ...custom.map((s) => ({ ...s, builtIn: false, measured: true, published: null }))
  ]
}

export function getStock(db: LockerDb, id: string): Stock {
  const s = listStocks(db).find((x) => x.id === id) ?? listStocks(db)[0]!
  return StockSchema.parse(s)
}

/** A school's own measurements for a built-in stock, or a new custom stock. */
export function saveStock(db: LockerDb, ctx: OperatorContext, stock: Stock): void {
  if (BUILT_IN_STOCKS.some((s) => s.id === stock.id)) {
    const measured = { ...getSetting(db, 'labels.measured', StockMap, {}), [stock.id]: stock }
    setSetting(db, ctx, 'labels.measured', measured)
  } else {
    const custom = getSetting(db, 'labels.customStocks', StockList, []).filter(
      (s) => s.id !== stock.id
    )
    setSetting(db, ctx, 'labels.customStocks', [...custom, stock])
  }
}

export function resetStock(db: LockerDb, ctx: OperatorContext, id: string): void {
  const measured = { ...getSetting(db, 'labels.measured', StockMap, {}) }
  delete measured[id]
  setSetting(db, ctx, 'labels.measured', measured)
  setSetting(
    db,
    ctx,
    'labels.customStocks',
    getSetting(db, 'labels.customStocks', StockList, []).filter((s) => s.id !== id)
  )
}

export function labelTemplate(db: LockerDb): LabelTemplate {
  const row = db.get<{ definition: string }>(
    "SELECT definition FROM label_template WHERE id = 'default'"
  )
  if (row) {
    try {
      const parsed = LabelTemplateSchema.safeParse(JSON.parse(row.definition))
      if (parsed.success) return parsed.data
    } catch {
      // fall through to the default
    }
  }
  return defaultTemplate(getStock(db, 'avery-l7163'))
}

export function saveLabelTemplate(
  db: LockerDb,
  ctx: OperatorContext,
  t: LabelTemplate
): LabelTemplate {
  const current = labelTemplate(db)
  // A different stock: carry the layout across, scaled to the new label size.
  const next =
    t.stockId !== current.stockId && JSON.stringify(t.elements) === JSON.stringify(current.elements)
      ? rescaleTemplate(t, getStock(db, current.stockId), getStock(db, t.stockId))
      : t
  const s = stamp(ctx)
  db.run(
    `INSERT INTO label_template (id, name, definition, created_at, updated_at, updated_by) VALUES ('default', 'Locker labels', $d, $c, $c, $by)
     ON CONFLICT (id) DO UPDATE SET definition = excluded.definition, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    { $d: JSON.stringify(next), $c: s.created_at, $by: s.updated_by }
  )
  return next
}

export function resetLabelLayout(db: LockerDb, ctx: OperatorContext): LabelTemplate {
  const t = labelTemplate(db)
  return saveLabelTemplate(db, ctx, {
    ...defaultTemplate(getStock(db, t.stockId)),
    colour: t.colour,
    usePreferredName: t.usePreferredName
  })
}

export function listPrinters(db: LockerDb): PrinterOffset[] {
  return getSetting(db, 'labels.printers', Printers, [])
}

export function savePrinter(db: LockerDb, ctx: OperatorContext, p: PrinterOffset): void {
  const list = listPrinters(db).filter((x) => x.name.toLowerCase() !== p.name.toLowerCase())
  setSetting(
    db,
    ctx,
    'labels.printers',
    [...list, p].sort((a, b) => a.name.localeCompare(b.name))
  )
}

export function deletePrinter(db: LockerDb, ctx: OperatorContext, name: string): void {
  setSetting(
    db,
    ctx,
    'labels.printers',
    listPrinters(db).filter((x) => x.name !== name)
  )
}

export function printerOffset(db: LockerDb, name: string | null): { right: number; down: number } {
  const p = name ? listPrinters(db).find((x) => x.name === name) : undefined
  return { right: p?.right ?? 0, down: p?.down ?? 0 }
}

/** "1-10, 15, B3" -> the matching lockers. Ranges work on plain numbers. */
export function parseLockerList(text: string, numbers: readonly string[]): Set<string> {
  const wanted = new Set<string>()
  const lower = new Map(numbers.map((n) => [n.toLowerCase(), n]))
  for (const part of text
    .split(/[,;\s]+/)
    .map((p) => p.trim())
    .filter(Boolean)) {
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(part)
    if (range) {
      const a = Number(range[1])
      const b = Number(range[2])
      for (const n of numbers)
        if (/^\d+$/.test(n) && Number(n) >= Math.min(a, b) && Number(n) <= Math.max(a, b))
          wanted.add(n)
    } else {
      const hit = lower.get(part.toLowerCase())
      if (hit) wanted.add(hit)
    }
  }
  return wanted
}

export function lastPrintAt(db: LockerDb, kind: 'labels' | 'letters'): string | null {
  return (
    db.get<{ at: string }>('SELECT MAX(printed_at) AS at FROM print_job WHERE kind = $k', {
      $k: kind
    })?.at ?? null
  )
}

/** The labels to print, in locker order (SPEC.md 4.7). */
export function labelRecords(
  db: LockerDb,
  selection: LabelSelection,
  usePreferred: boolean
): LabelRecord[] {
  const map = groupMap(db)
  const rows = db.all<{
    id: string
    number: string
    status: string
    qr_id: string
    area: string
    bank: string
    bank_id: string
    first_name: string | null
    preferred_name: string | null
    last_name: string | null
    group_code: string | null
    year_level: string | null
    assigned_at: string | null
  }>(
    `SELECT l.id, l.number, l.status, l.qr_id, a.name AS area, b.name AS bank, b.id AS bank_id,
            s.first_name, s.preferred_name, s.last_name, s.group_code, s.year_level, x.created_at AS assigned_at
       FROM locker l JOIN bank b ON b.id = l.bank_id JOIN area a ON a.id = b.area_id
       LEFT JOIN assignment x ON x.locker_id = l.id AND x.status = 'current'
       LEFT JOIN student s ON s.id = x.student_id
      WHERE l.archived_at IS NULL
      ORDER BY l.sort_key`
  )
  let filtered = rows
  switch (selection.mode) {
    case 'all':
      break
    case 'group':
      filtered = rows.filter((r) => r.group_code === selection.group)
      break
    case 'bank':
      filtered = rows.filter((r) => r.bank_id === selection.bankId)
      break
    case 'lockers': {
      const wanted = parseLockerList(
        selection.numbers,
        rows.map((r) => r.number)
      )
      filtered = rows.filter((r) => wanted.has(r.number))
      break
    }
    case 'spare':
      filtered = rows.filter((r) => r.first_name === null && r.status === 'in_service')
      break
    case 'changed': {
      const since = lastPrintAt(db, 'labels')
      if (since) {
        const endedSince = new Set(
          db
            .all<{ locker_id: string }>(
              "SELECT DISTINCT locker_id FROM assignment WHERE status = 'ended' AND updated_at > $s",
              { $s: since }
            )
            .map((r) => r.locker_id)
        )
        const renamed = new Set(
          db
            .all<{ id: string }>(
              "SELECT DISTINCT entity_id AS id FROM audit_log WHERE entity = 'locker' AND at > $s",
              { $s: since }
            )
            .map((r) => r.id)
        )
        filtered = rows.filter(
          (r) =>
            (r.assigned_at !== null && r.assigned_at > since) ||
            endedSince.has(r.id) ||
            renamed.has(r.id)
        )
      }
      break
    }
  }
  return filtered
    .map((r) => ({
      lockerId: r.id,
      number: r.number,
      area: r.area,
      bank: r.bank,
      qrId: r.qr_id,
      status: (r.first_name !== null
        ? 'assigned'
        : r.status === 'out_of_service'
          ? 'out_of_service'
          : 'spare') as LabelRecord['status'],
      firstName:
        r.first_name !== null
          ? usePreferred && r.preferred_name
            ? r.preferred_name
            : r.first_name
          : null,
      lastName: r.last_name,
      group: displayGroup(r.group_code, map),
      yearLevel: r.year_level
    }))
    .sort((a, b) => compareLockerNumbers(a.number, b.number))
}

export function schoolLogos(db: LockerDb): { colour: string | null; mono: string | null } {
  const p = getSchoolProfile(db)
  return { colour: p.logoDataUrl, mono: p.monoLogoDataUrl }
}

export function recordPrintJob(
  db: LockerDb,
  ctx: OperatorContext,
  kind: 'labels' | 'letters' | 'report' | 'calibration',
  lockerIds: readonly string[]
): string {
  const s = stamp(ctx)
  const id = newId()
  db.run(
    `INSERT INTO print_job (id, kind, template_id, records, printed_at, printed_by, machine, created_at, updated_at, updated_by)
     VALUES ($id, $k, 'default', $r, $at, $by, $m, $at, $at, $by)`,
    {
      $id: id,
      $k: kind,
      $r: JSON.stringify(lockerIds),
      $at: s.created_at,
      $by: s.updated_by,
      $m: ctx.machine
    }
  )
  return id
}
