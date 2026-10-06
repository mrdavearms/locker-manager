import { z } from 'zod'
import type { AreaView, LockerView, SchoolProfile } from './locations'
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
  'setup.complete': z.object({ done: z.boolean() })
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
}

export type RpcMethod = keyof typeof rpcParams
export type RpcParams<M extends RpcMethod> = z.input<(typeof rpcParams)[M]>
export type RpcResponse<M extends RpcMethod> =
  { ok: true; value: RpcResults[M] } | { ok: false; message: string }

export function isRpcMethod(m: unknown): m is RpcMethod {
  return typeof m === 'string' && Object.prototype.hasOwnProperty.call(rpcParams, m)
}

export { LOCK_TYPES }
