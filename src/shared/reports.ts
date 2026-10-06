import { z } from 'zod'

// Lists and reports (SPEC.md 4.9 and 5.4). Each report is built as a table in the
// main process; the same table is shown, printed, saved as PDF, or exported as
// CSV or Excel. Codes are never shown on screen: the preview masks them.

export const REPORT_IDS = [
  'group_lists',
  'master',
  'by_bank',
  'reset_checklist',
  'self_reset',
  'sign_off',
  'key_register',
  'changes'
] as const
export type ReportId = (typeof REPORT_IDS)[number]

export interface ReportInfo {
  title: string
  description: string
  /** never: no codes; always: the report is the codes; optional: a tick box adds them. */
  codes: 'never' | 'always' | 'optional'
  /** Which choices the report offers. */
  group: boolean
  since: boolean
  landscape: boolean
}

export const REPORTS: Record<ReportId, ReportInfo> = {
  group_lists: {
    title: 'Group lists for teachers',
    description: 'Each group on its own page: students and their lockers. No codes.',
    codes: 'never',
    group: true,
    since: false,
    landscape: false
  },
  master: {
    title: 'Master list with codes',
    description:
      'Every locker, student and code. Marked CONFIDENTIAL, and every code printed is recorded.',
    codes: 'always',
    group: true,
    since: false,
    landscape: false
  },
  by_bank: {
    title: 'Lockers by bank',
    description: 'Every locker in each bank: in use, spare, reserved or out of service.',
    codes: 'never',
    group: false,
    since: false,
    landscape: false
  },
  reset_checklist: {
    title: 'Locks to reset',
    description: 'A tick list of locks that need a physical reset, for whoever has the master key.',
    codes: 'optional',
    group: false,
    since: false,
    landscape: false
  },
  self_reset: {
    title: 'End-of-year reset checklist',
    description:
      'Each group on its own page, so students can reset their own lock to 0 0 0 0 in class on their last day.',
    codes: 'never',
    group: true,
    since: false,
    landscape: false
  },
  sign_off: {
    title: 'Sign-off sheet',
    description: 'Each group on its own page: students sign that they received their letter.',
    codes: 'never',
    group: true,
    since: false,
    landscape: false
  },
  key_register: {
    title: 'Key register',
    description: 'Keyed locks, their key numbers, and keys not yet returned.',
    codes: 'never',
    group: false,
    since: false,
    landscape: true
  },
  changes: {
    title: 'Changes since a date',
    description: 'Everything changed in the file since the date you choose: who, when and what.',
    codes: 'never',
    group: false,
    since: true,
    landscape: true
  }
}

export const ReportRequestSchema = z.object({
  id: z.enum(REPORT_IDS),
  /** One group, by its code, or every group. */
  group: z.string().max(40).nullable(),
  /** yyyy-mm-dd, for "changes since". */
  since: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  includeCodes: z.boolean()
})
export type ReportRequest = z.infer<typeof ReportRequestSchema>

export interface ReportColumn {
  key: string
  label: string
  /** Relative width. */
  width: number
  /** tick: an empty box to tick; blank: an empty space to write in. */
  kind?: 'text' | 'tick' | 'blank' | 'code'
}

export interface ReportSection {
  heading: string | null
  rows: Record<string, string>[]
}

export interface ReportData {
  title: string
  /** A line under the title, for example "Homeroom 7A" or "Since 1 Feb 2027". */
  subtitle: string | null
  /** Short instructions printed above the table. */
  note: string | null
  columns: ReportColumn[]
  sections: ReportSection[]
  /** What the section heading is, for exports ("Homeroom", "Bank"). */
  sectionLabel: string | null
  /** Each section starts a new page. */
  breakBetween: boolean
  confidential: boolean
  landscape: boolean
  rows: number
}

export interface ReportPreview {
  html: string
  rows: number
  confidential: boolean
}

export const EXPORT_FORMATS = ['csv', 'xlsx'] as const
export type ExportFormat = (typeof EXPORT_FORMATS)[number]
