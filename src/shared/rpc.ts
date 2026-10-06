import { z } from 'zod'
import type { FilePreview, ImportAnalysis, ImportOptions, ImportResult } from './importTypes'
import { IMPORT_FIELDS } from './importTypes'
import type { AreaView, LockerView, SchoolProfile } from './locations'
import type { ExclusionView, GroupView, StudentCounts, StudentView } from './students'
import { LOCK_TYPES, LockDefaultsSchema, type LockDefaults } from './locks'
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
    confirmName: z.boolean().optional()
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
  'group.setSortLast': z.object({ code: z.string().min(1).max(40), sortLast: z.boolean() })
} as const

export interface SetupStatus {
  completed: boolean
  hasSchoolDetails: boolean
  hasTerms: boolean
  lockers: number
  lockersWithoutLock: number
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
  'student.stillHere': null
  'student.confirmLeft': null
  'exclusions.list': ExclusionView[]
  'exclusion.add': string
  'exclusion.remove': null
  'groups.list': GroupView[]
  'group.setDisplay': null
  'group.setSortLast': null
}

export type RpcMethod = keyof typeof rpcParams
export type RpcParams<M extends RpcMethod> = z.input<(typeof rpcParams)[M]>
export type RpcResponse<M extends RpcMethod> =
  { ok: true; value: RpcResults[M] } | { ok: false; message: string }

export function isRpcMethod(m: unknown): m is RpcMethod {
  return typeof m === 'string' && Object.prototype.hasOwnProperty.call(rpcParams, m)
}

export { LOCK_TYPES }
