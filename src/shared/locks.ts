import { z } from 'zod'

// Lock types (SPEC.md 3.4).
export const LOCK_TYPES = [
  'combination_builtin',
  'combination_padlock_settable',
  'combination_padlock_fixed',
  'keyed_padlock',
  'keyed_builtin',
  'electronic',
  'none'
] as const
export type LockType = (typeof LOCK_TYPES)[number]

export const LOCK_TYPE_INFO: Record<
  LockType,
  { name: string; description: string; hasCode: boolean; codeSettable: boolean; keyed: boolean }
> = {
  combination_builtin: {
    name: 'Built-in combination lock',
    description: 'A dial lock in the locker door. Staff can reset the code.',
    hasCode: true,
    codeSettable: true,
    keyed: false
  },
  combination_padlock_settable: {
    name: 'Combination padlock (settable)',
    description: 'A padlock whose code can be set.',
    hasCode: true,
    codeSettable: true,
    keyed: false
  },
  combination_padlock_fixed: {
    name: 'Combination padlock (fixed code)',
    description:
      'A padlock with a factory code that cannot change. Changing the code means swapping the padlock.',
    hasCode: true,
    codeSettable: false,
    keyed: false
  },
  keyed_padlock: {
    name: 'Keyed padlock',
    description: 'A padlock opened with a key.',
    hasCode: false,
    codeSettable: false,
    keyed: true
  },
  keyed_builtin: {
    name: 'Built-in keyed lock',
    description: 'A keyed lock in the locker door.',
    hasCode: false,
    codeSettable: false,
    keyed: true
  },
  electronic: {
    name: 'Electronic lock',
    description: 'A PIN or card lock.',
    hasCode: true,
    codeSettable: true,
    keyed: false
  },
  none: {
    name: 'No lock',
    description: 'Students bring their own padlock, or the locker is left unlocked.',
    hasCode: false,
    codeSettable: false,
    keyed: false
  }
}

export const LockDefaultsSchema = z.object({
  type: z.enum(LOCK_TYPES),
  dials: z.number().int().min(3).max(6),
  positionsPerDial: z.number().int().min(2).max(100),
  manufacturer: z.string().max(60).optional(),
  model: z.string().max(60).optional()
})
export type LockDefaults = z.infer<typeof LockDefaultsSchema>

export const DEFAULT_LOCK: LockDefaults = {
  type: 'combination_builtin',
  dials: 4,
  positionsPerDial: 10
}
