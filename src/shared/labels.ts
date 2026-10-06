import { z } from 'zod'

// Label stock, layouts and print settings (SPEC.md 5.1). All sizes in millimetres.

export const StockSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(80),
  pageWidth: z.number().min(50).max(500),
  pageHeight: z.number().min(50).max(500),
  labelWidth: z.number().min(5).max(400),
  labelHeight: z.number().min(5).max(400),
  columns: z.number().int().min(1).max(20),
  rows: z.number().int().min(1).max(40),
  top: z.number().min(0).max(200),
  left: z.number().min(0).max(200),
  /** Distance from one label's left edge to the next one's. */
  pitchX: z.number().min(0).max(400),
  /** Distance from one label's top edge to the next one's. */
  pitchY: z.number().min(0).max(400),
  cornerRadius: z.number().min(0).max(20)
})
export type Stock = z.infer<typeof StockSchema>

export const ELEMENT_TYPES = [
  'logo',
  'name',
  'group',
  'yearLevel',
  'lockerNumber',
  'area',
  'bank',
  'rule',
  'qr',
  'text'
] as const
export type ElementType = (typeof ELEMENT_TYPES)[number]

export const ELEMENT_LABELS: Record<ElementType, string> = {
  logo: 'Logo',
  name: 'Student name',
  group: 'Group (Homeroom)',
  yearLevel: 'Year level',
  lockerNumber: 'Locker number',
  area: 'Area',
  bank: 'Bank',
  rule: 'Line',
  qr: 'QR code',
  text: 'Your own text'
}

export const LabelElementSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(ELEMENT_TYPES),
  x: z.number().min(-50).max(400),
  y: z.number().min(-50).max(400),
  w: z.number().min(0.5).max(400),
  h: z.number().min(0.2).max(400),
  /** Largest and smallest font size in points; text shrinks between them to fit. */
  fontMax: z.number().min(4).max(96),
  fontMin: z.number().min(4).max(96),
  bold: z.boolean(),
  align: z.enum(['left', 'center', 'right']),
  /** name: first name over last name, or both on one line. */
  nameMode: z.enum(['stacked', 'one_line']),
  /** lockerNumber: put the word "LOCKER" before the number. */
  showWord: z.boolean(),
  text: z.string().max(120)
})
export type LabelElement = z.infer<typeof LabelElementSchema>

export const LabelTemplateSchema = z.object({
  stockId: z.string().min(1).max(64),
  elements: z.array(LabelElementSchema).max(30),
  /** Nothing is printed closer than this to a label's edge. */
  safeMargin: z.number().min(0).max(15),
  colour: z.enum(['mono', 'colour']),
  usePreferredName: z.boolean()
})
export type LabelTemplate = z.infer<typeof LabelTemplateSchema>

export const PrinterOffsetSchema = z.object({
  name: z.string().trim().min(1).max(80),
  /** Positive moves everything right / down. */
  right: z.number().min(-20).max(20),
  down: z.number().min(-20).max(20)
})
export type PrinterOffset = z.infer<typeof PrinterOffsetSchema>

export const LabelSelectionSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('all') }),
  z.object({ mode: z.literal('group'), group: z.string().min(1).max(40) }),
  z.object({ mode: z.literal('bank'), bankId: z.string().min(1).max(64) }),
  z.object({ mode: z.literal('lockers'), numbers: z.string().min(1).max(2000) }),
  z.object({ mode: z.literal('changed') }),
  z.object({ mode: z.literal('spare') })
])
export type LabelSelection = z.infer<typeof LabelSelectionSchema>

export interface LabelRecord {
  lockerId: string
  number: string
  area: string
  bank: string
  qrId: string
  status: 'assigned' | 'spare' | 'out_of_service'
  firstName: string | null
  lastName: string | null
  group: string | null
  yearLevel: string | null
}

export interface StockView extends Stock {
  builtIn: boolean
  /** True when a school has entered its own measurements for this stock. */
  measured: boolean
  published: Stock | null
}

export interface LabelPreview {
  html: string
  sheets: number
  labels: number
  tooLong: { number: string; name: string }[]
  stock: Stock
}
