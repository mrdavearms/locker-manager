import { z } from 'zod'
import type { FilePreview, ImportAnalysis, ImportOptions, ImportResult } from './importTypes'
import { IMPORT_FIELDS } from './importTypes'
import type { AreaView, LockerView, SchoolProfile } from './locations'
import type { ExclusionView, GroupView, StudentCounts, StudentView } from './students'
import { AllocationPlanSchema, type AllocationPlan, type DraftView } from './allocation'
import {
  CodeRulesSchema,
  type CodeRules,
  type CodeRulesSummary,
  type CodeSetView,
  type ResetTask
} from './codes'
import type { HistoryEntryView, QuickResult } from './history'
import {
  LabelSelectionSchema,
  LabelTemplateSchema,
  PrinterOffsetSchema,
  StockSchema,
  type LabelPreview,
  type LabelTemplate,
  type PrinterOffset,
  type StockView
} from './labels'
import {
  LETTER_IMAGE_TYPES,
  LetterLanguageSchema,
  LetterSelectionSchema,
  LetterTemplateSchema,
  LANGUAGE_CODE,
  type ImageView,
  type LetterPreview,
  type LetterTemplate
} from './letters'
import { LOCK_TYPES, LockDefaultsSchema, type LockDefaults } from './locks'
import { ReportRequestSchema, type ReportPreview } from './reports'
import type { RolloverStatus, SelfResetGroup } from './rollover'
import { KEY_EVENTS, type KeyInfo } from './keys'
import type { PrivacyView } from './privacy'
import type { Problem } from './problems'
import { BackupRulesSchema, type BackupRules } from './storage'
import { TerminologySchema, type Terminology } from './terminology'

// The one contract for data requests between the window and the main process
// (SPEC.md 8.2). Each method has a Zod schema for its input, checked in the main
// process, and a result type. The preload exposes a single typed `rpc` call.

const id = z.string().min(1).max(64)
const name = z.string().trim().min(1).max(120)
const colour = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const BulkPlanInputSchema = z.object({
  prefix: z.string().max(8),
  from: z.number().int().min(0).max(999_999),
  to: z.number().int().min(0).max(999_999),
  padTo: z.number().int().min(0).max(6),
  tiers: z.number().int().min(1).max(4),
  order: z.enum(['down_then_across', 'across_then_down'])
})
export type BulkPlanInputView = z.infer<typeof BulkPlanInputSchema>

const FileSettingsSchema = z.object({
  sheetIndex: z.number().int().min(0),
  headerRow: z.number().int().min(0),
  mapping: z.partialRecord(z.enum(IMPORT_FIELDS), z.number().int().min(0)),
  yearSource: z.enum(['column', 'group', 'fixed']),
  fixedYear: z.string().max(20).nullable()
})
const ImportOptionsSchema = z.object({
  particles: z.enum(['lower', 'capital']),
  groupMap: z.record(z.string().max(40), z.string().max(40)),
  wholeSchool: z.boolean()
})
const studentFilter = z.enum([
  'current',
  'possible_leavers',
  'name_check',
  'no_locker',
  'left',
  'all'
])

export const rpcParams = {
  'school.get': z.object({}),
  'school.update': z.object({
    name: name.optional(),
    shortName: z.string().max(40).nullable().optional(),
    colourPrimary: colour.nullable().optional(),
    colourAccent: colour.nullable().optional(),
    colourStripes: z.array(colour).max(3).optional(),
    address: z.string().max(300).nullable().optional()
  }),
  'school.setLogo': z.object({
    which: z.enum(['colour', 'mono']),
    bytes: z.instanceof(Uint8Array).nullable(),
    type: z.enum(['image/png', 'image/svg+xml', 'image/jpeg']).nullable()
  }),
  'terms.get': z.object({}),
  'terms.set': z.object({ terms: TerminologySchema }),
  'locations.list': z.object({}),
  'area.create': z.object({
    name,
    description: z.string().max(300).nullable().optional(),
    colour: colour.nullable().optional(),
    defaultYearLevels: z.array(z.string().max(40)).max(20).optional()
  }),
  'area.update': z.object({
    id,
    name: name.optional(),
    description: z.string().max(300).nullable().optional(),
    colour: colour.nullable().optional(),
    defaultYearLevels: z.array(z.string().max(40)).max(20).optional(),
    sortOrder: z.number().int().optional()
  }),
  'area.archive': z.object({ id }),
  'bank.create': z.object({ areaId: id, name, notes: z.string().max(300).nullable().optional() }),
  'bank.update': z.object({
    id,
    name: name.optional(),
    areaId: id.optional(),
    notes: z.string().max(300).nullable().optional(),
    sortOrder: z.number().int().optional()
  }),
  'bank.archive': z.object({ id }),
  'lockers.list': z.object({ bankId: id.optional() }),
  'lockers.planBulk': z.object({ input: BulkPlanInputSchema }),
  'lockers.addBulk': z.object({
    bankId: id,
    input: BulkPlanInputSchema,
    capacity: z.number().int().min(1).max(6),
    lock: LockDefaultsSchema.nullable()
  }),
  'locker.update': z.object({
    id,
    capacity: z.number().int().min(1).max(6).optional(),
    accessible: z.boolean().optional(),
    status: z.enum(['in_service', 'out_of_service', 'reserved']).optional(),
    outOfServiceReason: z.string().max(200).nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
    tier: z.enum(['top', 'middle', 'bottom']).nullable().optional()
  }),
  'locker.renumber': z.object({
    id,
    number: z.string().trim().min(1).max(20),
    reason: z.string().trim().min(3).max(200)
  }),
  'locker.archive': z.object({ id, reason: z.string().trim().min(3).max(200) }),
  'locks.setForBank': z.object({ bankId: id, lock: LockDefaultsSchema }),
  'locks.defaults.get': z.object({}),
  'locks.defaults.set': z.object({ lock: LockDefaultsSchema }),
  'setup.status': z.object({}),
  'setup.complete': z.object({ done: z.boolean() }),
  'import.load': z.object({
    files: z
      .array(z.object({ name: z.string().min(1).max(260), bytes: z.instanceof(Uint8Array) }))
      .max(12),
    pasted: z.string().max(5_000_000).nullable()
  }),
  'import.options.get': z.object({}),
  'import.analyse': z.object({
    importId: id,
    files: z.array(FileSettingsSchema).max(12),
    options: ImportOptionsSchema
  }),
  'import.apply': z.object({
    importId: id,
    files: z.array(FileSettingsSchema).max(12),
    options: ImportOptionsSchema,
    selections: z.object({
      add: z.array(z.string().max(64)),
      update: z.array(id),
      markMissing: z.array(id)
    }),
    profile: z.string().max(60)
  }),
  'import.discard': z.object({ importId: id }),
  'students.list': z.object({
    filter: studentFilter,
    search: z.string().max(100).optional(),
    yearLevel: z.string().max(20).optional(),
    group: z.string().max(40).optional()
  }),
  'students.counts': z.object({}),
  'student.get': z.object({ id }),
  'student.update': z.object({
    id,
    firstName: z.string().max(80).optional(),
    lastName: z.string().max(80).optional(),
    preferredName: z.string().max(80).nullable().optional(),
    needsAccessible: z.boolean().optional(),
    confirmName: z.boolean().optional(),
    yearLevel: z.string().max(20).nullable().optional(),
    groupCode: z.string().max(40).nullable().optional()
  }),
  'student.create': z.object({
    externalId: z.string().trim().min(1).max(40),
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    preferredName: z.string().max(80).nullable(),
    yearLevel: z.string().max(20).nullable(),
    groupCode: z.string().max(40).nullable()
  }),
  'student.stillHere': z.object({ id }),
  'student.confirmLeft': z.object({ id }),
  'exclusions.list': z.object({}),
  'exclusion.add': z.object({
    kind: z.enum(['student', 'group', 'year_level']),
    value: z.string().trim().min(1).max(64),
    reason: z.string().trim().min(3).max(200)
  }),
  'exclusion.remove': z.object({ id }),
  'groups.list': z.object({}),
  'group.setDisplay': z.object({
    code: z.string().min(1).max(40),
    display: z.string().max(40).nullable()
  }),
  'group.setSortLast': z.object({ code: z.string().min(1).max(40), sortLast: z.boolean() }),
  'codes.rules.get': z.object({}),
  'codes.rules.set': z.object({ rules: CodeRulesSchema }),
  'codes.rules.preview': z.object({ rules: CodeRulesSchema }),
  'codes.sets.list': z.object({}),
  'codes.sets.generate': z.object({
    name: z.string().trim().min(1).max(80),
    seed: z.string().max(64).nullable()
  }),
  'codes.resetTasks': z.object({}),
  'codes.resetDone': z.object({ lockId: id }),
  'codes.reveal': z.object({ lockerId: id }),
  'codes.recode': z.object({ lockerId: id, reason: z.string().trim().min(3).max(200) }),
  'codes.setFixed': z.object({
    lockerId: id,
    code: z.string().trim().min(1).max(20),
    serial: z.string().max(60).nullable()
  }),
  'allocation.plan.get': z.object({}),
  'allocation.plan.set': z.object({ plan: AllocationPlanSchema }),
  'allocation.draft': z.object({ plan: AllocationPlanSchema }),
  'allocation.commit': z.object({
    assignments: z.array(z.object({ studentId: id, lockerId: id })).max(10_000),
    issueCodes: z.boolean()
  }),
  'locker.suggest': z.object({ studentId: id }),
  'student.lockerFits': z.object({ studentId: id }),
  'student.assign': z.object({ studentId: id, lockerId: id }),
  'student.release': z.object({
    studentId: id,
    left: z.boolean(),
    reason: z.string().max(200).optional()
  }),
  'student.move': z.object({ studentId: id, lockerId: id, reason: z.string().max(200).optional() }),
  'student.swap': z.object({
    studentId: id,
    otherStudentId: id,
    reason: z.string().max(200).optional()
  }),
  'history.list': z.object({
    search: z.string().max(100).optional(),
    limit: z.number().int().min(1).max(1000),
    before: z.string().max(40).optional()
  }),
  'search.quick': z.object({ q: z.string().max(100) }),
  'labels.stocks': z.object({}),
  'labels.stock.save': z.object({ stock: StockSchema }),
  'labels.stock.reset': z.object({ id: z.string().min(1).max(64) }),
  'labels.template.get': z.object({}),
  'labels.template.set': z.object({ template: LabelTemplateSchema }),
  'labels.template.reset': z.object({}),
  'labels.printers.list': z.object({}),
  'labels.printers.save': z.object({ printer: PrinterOffsetSchema }),
  'labels.printers.delete': z.object({ name: z.string().min(1).max(80) }),
  'labels.preview': z.object({
    selection: LabelSelectionSchema,
    startAt: z.number().int().min(1).max(100),
    template: LabelTemplateSchema.optional()
  }),
  'labels.calibrationPreview': z.object({
    stockId: z.string().max(64).nullable(),
    printer: z.string().max(80).nullable()
  }),
  'letters.template.get': z.object({}),
  'letters.template.set': z.object({ template: LetterTemplateSchema }),
  'letters.template.reset': z.object({}),
  'letters.images.list': z.object({}),
  'letters.images.add': z.object({
    name: z.string().trim().min(1).max(120),
    mime: z.enum(LETTER_IMAGE_TYPES),
    bytes: z.instanceof(Uint8Array),
    width: z.number().int().min(1).max(20_000),
    height: z.number().int().min(1).max(20_000)
  }),
  'letters.images.delete': z.object({ id }),
  'letters.preview': z.object({
    selection: LetterSelectionSchema,
    language: LetterLanguageSchema,
    index: z.number().int().min(0).max(100_000),
    template: LetterTemplateSchema.optional()
  }),
  'students.setLanguage': z.object({ studentId: id, code: LANGUAGE_CODE.nullable() }),
  'reports.preview': z.object({ request: ReportRequestSchema }),
  'rollover.status': z.object({}),
  'rollover.start': z.object({}),
  'rollover.selfResetGroups': z.object({}),
  'rollover.recordOnZero': z.object({ lockIds: z.array(id).max(10_000) }),
  'rollover.archive': z.object({ typed: z.string().max(60) }),
  'rollover.promote': z.object({ lastYearLevel: z.string().regex(/^\d{1,2}$/) }),
  'rollover.finish': z.object({}),
  'keys.get': z.object({ lockerId: id }),
  'keys.setNumber': z.object({ lockId: id, keyNumber: z.string().max(40).nullable() }),
  'keys.event': z.object({
    lockId: id,
    event: z.enum(KEY_EVENTS),
    studentId: id.nullable(),
    notes: z.string().max(300).nullable(),
    amountCents: z.number().int().min(0).max(1_000_000).nullable()
  }),
  'privacy.get': z.object({}),
  'privacy.unlock': z.object({ pin: z.string().max(8) }),
  'privacy.lock': z.object({}),
  'privacy.setPin': z.object({
    pin: z
      .string()
      .regex(/^\d{4,8}$/)
      .nullable(),
    currentPin: z.string().max(8).nullable()
  }),
  'privacy.setAutoHide': z.object({ seconds: z.number().int().min(5).max(600) }),
  'problems.list': z.object({}),
  'storage.rules.set': z.object({ rules: BackupRulesSchema })
} as const

export interface SetupStatus {
  completed: boolean
  hasSchoolDetails: boolean
  hasTerms: boolean
  lockers: number
  lockersWithoutLock: number
  /** For the getting-started list on Home. */
  labelsPrinted: boolean
  lettersPrinted: boolean
}

export interface PlannedLockerView {
  number: string
  row: number
  column: number
  tier: 'top' | 'middle' | 'bottom' | null
}

export interface RpcResults {
  'school.get': SchoolProfile
  'school.update': SchoolProfile
  'school.setLogo': SchoolProfile
  'terms.get': Terminology
  'terms.set': Terminology
  'locations.list': AreaView[]
  'area.create': string
  'area.update': null
  'area.archive': null
  'bank.create': string
  'bank.update': null
  'bank.archive': null
  'lockers.list': LockerView[]
  'lockers.planBulk': { planned: PlannedLockerView[]; duplicates: string[] }
  'lockers.addBulk': number
  'locker.update': null
  'locker.renumber': { from: string; to: string }
  'locker.archive': null
  'locks.setForBank': number
  'locks.defaults.get': LockDefaults
  'locks.defaults.set': LockDefaults
  'setup.status': SetupStatus
  'setup.complete': SetupStatus
  'import.load': { importId: string; previews: FilePreview[] }
  'import.options.get': ImportOptions
  'import.analyse': ImportAnalysis
  'import.apply': ImportResult
  'import.discard': null
  'students.list': StudentView[]
  'students.counts': StudentCounts
  'student.get': StudentView | null
  'student.update': StudentView
  'student.create': StudentView
  'student.stillHere': null
  'student.confirmLeft': null
  'exclusions.list': ExclusionView[]
  'exclusion.add': string
  'exclusion.remove': null
  'groups.list': GroupView[]
  'group.setDisplay': null
  'group.setSortLast': null
  'codes.rules.get': CodeRules
  'codes.rules.set': CodeRules
  'codes.rules.preview': CodeRulesSummary
  'codes.sets.list': CodeSetView[]
  'codes.sets.generate': { codes: number; spares: number; validCount: number; overHalf: boolean }
  'codes.resetTasks': ResetTask[]
  'codes.resetDone': null
  'codes.reveal': { code: string | null }
  'codes.recode': { code: string | null }
  'codes.setFixed': null
  'allocation.plan.get': AllocationPlan
  'allocation.plan.set': AllocationPlan
  'allocation.draft': DraftView
  'allocation.commit': { assigned: number; codes: number }
  'locker.suggest': { lockerId: string; number: string } | null
  'student.lockerFits': {
    fits: boolean
    suggestion: { lockerId: string; number: string } | null
  }
  'student.assign': { code: string | null; lockerNumber: string }
  'student.release': null
  'student.move': { code: string | null; lockerNumber: string }
  'student.swap': null
  'history.list': HistoryEntryView[]
  'search.quick': QuickResult[]
  'labels.stocks': StockView[]
  'labels.stock.save': StockView[]
  'labels.stock.reset': StockView[]
  'labels.template.get': LabelTemplate
  'labels.template.set': LabelTemplate
  'labels.template.reset': LabelTemplate
  'labels.printers.list': PrinterOffset[]
  'labels.printers.save': PrinterOffset[]
  'labels.printers.delete': PrinterOffset[]
  'labels.preview': LabelPreview
  'labels.calibrationPreview': { html: string }
  'letters.template.get': LetterTemplate
  'letters.template.set': LetterTemplate
  'letters.template.reset': LetterTemplate
  'letters.images.list': ImageView[]
  'letters.images.add': ImageView[]
  'letters.images.delete': ImageView[]
  'letters.preview': LetterPreview
  'students.setLanguage': null
  'reports.preview': ReportPreview
  'rollover.status': RolloverStatus
  'rollover.start': RolloverStatus
  'rollover.selfResetGroups': SelfResetGroup[]
  'rollover.recordOnZero': { recorded: number }
  'rollover.archive': { ended: number; needReset: number; toYear: string }
  'rollover.promote': { promoted: number; left: number }
  'rollover.finish': null
  'keys.get': KeyInfo | null
  'keys.setNumber': KeyInfo | null
  'keys.event': null
  'privacy.get': PrivacyView
  'privacy.unlock': PrivacyView
  'privacy.lock': PrivacyView
  'privacy.setPin': PrivacyView
  'privacy.setAutoHide': PrivacyView
  'problems.list': Problem[]
  'storage.rules.set': BackupRules
}

export type RpcMethod = keyof typeof rpcParams
export type RpcParams<M extends RpcMethod> = z.input<(typeof rpcParams)[M]>
export type RpcResponse<M extends RpcMethod> =
  { ok: true; value: RpcResults[M] } | { ok: false; message: string }

export function isRpcMethod(m: unknown): m is RpcMethod {
  return typeof m === 'string' && Object.prototype.hasOwnProperty.call(rpcParams, m)
}

export { LOCK_TYPES }
