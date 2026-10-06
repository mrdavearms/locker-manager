import { z } from 'zod'

// Allocation plans (SPEC.md 4.4). A plan is a list of rules, each sending some
// students to some lockers, plus how to order both. Saved and reused each year.

export const AllocationRuleSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().max(80),
  /** Empty means every year level. */
  yearLevels: z.array(z.string().max(20)).max(20),
  /** Empty means every group. */
  groups: z.array(z.string().max(40)).max(200),
  /** Empty means any area. */
  areaIds: z.array(z.string().max(64)).max(50),
  bankIds: z.array(z.string().max(64)).max(200)
})
export type AllocationRule = z.infer<typeof AllocationRuleSchema>

export const AllocationPlanSchema = z.object({
  rules: z.array(AllocationRuleSchema).max(30),
  studentOrder: z.enum(['group_then_name', 'name', 'house_then_name', 'random', 'keep_last_year']),
  /** Groups placed after all the others, in this order (WHS: HUB). */
  groupsLast: z.array(z.string().max(40)).max(50),
  lockerOrder: z.enum(['number', 'bank_then_number', 'column', 'tier_preference']),
  tierPreference: z.array(z.enum(['top', 'middle', 'bottom'])).max(3),
  /** Spare lockers left after each group, so late enrolments land near their group. */
  gapAfterGroup: z.number().int().min(0).max(20),
  /** Spare lockers kept at the end of each bank. */
  gapAfterBank: z.number().int().min(0).max(50),
  accessibleFirst: z.boolean(),
  seed: z.string().max(64).nullable()
})
export type AllocationPlan = z.infer<typeof AllocationPlanSchema>

export const DEFAULT_PLAN: AllocationPlan = {
  rules: [],
  studentOrder: 'group_then_name',
  groupsLast: ['HUB'],
  lockerOrder: 'number',
  tierPreference: ['middle', 'bottom', 'top'],
  gapAfterGroup: 0,
  gapAfterBank: 0,
  accessibleFirst: true,
  seed: null
}

export interface DraftAssignment {
  studentId: string
  lockerId: string
}

export interface AllocationDraft {
  assignments: DraftAssignment[]
  /** Eligible students who did not fit. */
  unplaced: { studentId: string; ruleId: string }[]
  /** Students left out on purpose. */
  skipped: { studentId: string; reason: 'excluded' | 'has_locker' | 'no_rule' }[]
  byRule: { ruleId: string; label: string; students: number; lockers: number; placed: number }[]
}

export interface DraftView {
  draft: AllocationDraft
  students: Record<
    string,
    {
      name: string
      group: string | null
      groupDisplay: string | null
      yearLevel: string | null
      needsAccessible: boolean
    }
  >
}
