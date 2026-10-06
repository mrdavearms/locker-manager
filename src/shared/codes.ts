import { z } from 'zod'

// Lock code rules (SPEC.md 4.6). Every rule can be switched off; the defaults are
// the ones the WHS register used, plus the lock makers' warnings (section 15.18).

export const CodeRulesSchema = z.object({
  length: z.number().int().min(3).max(6),
  /** Values each dial can show: 10 is 0-9; 40 is 0-39 (rotary padlocks). */
  positions: z.number().int().min(2).max(100),
  banAllSame: z.boolean(),
  banThreeOfOne: z.boolean(),
  banRuns: z.boolean(),
  banRepeatedPairs: z.boolean(),
  banDoubledPairs: z.boolean(),
  banYears: z.boolean(),
  banDates: z.boolean(),
  banNearReset: z.boolean(),
  banLeadingZero: z.boolean(),
  banPrevious: z.boolean(),
  /** Never reuse a code this lock has had in this many years (0 = only the last one). */
  historyYears: z.number().int().min(0).max(20),
  blocklist: z.array(z.string().max(20)).max(500),
  uniqueness: z.enum(['school', 'area', 'none']),
  /** Spare codes kept ready for changes during the year. */
  sparePoolSize: z.number().int().min(0).max(5000)
})
export type CodeRules = z.infer<typeof CodeRulesSchema>

export const DEFAULT_CODE_RULES: CodeRules = {
  length: 4,
  positions: 10,
  banAllSame: true,
  banThreeOfOne: true,
  banRuns: true,
  banRepeatedPairs: true,
  banDoubledPairs: true,
  banYears: true,
  banDates: false,
  banNearReset: true,
  banLeadingZero: true,
  banPrevious: true,
  historyYears: 3,
  blocklist: [],
  uniqueness: 'school',
  sparePoolSize: 100
}

export const RULE_TEXT: Record<
  keyof Omit<
    CodeRules,
    'length' | 'positions' | 'historyYears' | 'blocklist' | 'uniqueness' | 'sparePoolSize'
  >,
  string
> = {
  banAllSame: 'All the same (1111)',
  banThreeOfOne: 'Three or more of one number (1511)',
  banRuns: 'Straight runs up or down (1234, 9876)',
  banRepeatedPairs: 'Repeated pairs (1212)',
  banDoubledPairs: 'Doubled pairs (1122)',
  banYears: 'Years (1900 to 2099)',
  banDates: 'Birthdays written as day and month (0312, 1203)',
  banNearReset: 'One number away from 0 0 0 0 (0001, 1000), which lock makers warn against',
  banLeadingZero: 'Starting with 0',
  banPrevious: 'The lock’s previous codes'
}

export type CodeStatus =
  'not_applicable' | 'set' | 'reset_no_code' | 'needs_new_code' | 'awaiting_physical_reset'

export const CODE_STATUS_TEXT: Record<CodeStatus, string> = {
  not_applicable: 'No code (keyed or no lock)',
  set: 'Code issued',
  reset_no_code: 'On 0 0 0 0, no code issued yet',
  needs_new_code: 'Needs a new code (someone else knows this one)',
  awaiting_physical_reset: 'New code issued; the lock must be reset first'
}

export interface CodeRulesSummary {
  validCount: number
  /** True when the count is an estimate (very large code spaces). */
  estimated: boolean
  samples: string[]
}

export interface CodeSetView {
  id: string
  name: string
  purpose: 'year' | 'spares'
  /** Made while lockers were out: kept for next year (SPEC.md 4.10 step 5). */
  forNextYear: boolean
  schoolYear: string | null
  total: number
  available: number
  createdAt: string
}

export interface ResetTask {
  lockId: string
  lockerId: string | null
  lockerNumber: string | null
  status: CodeStatus
  holder: string | null
  since: string
}
