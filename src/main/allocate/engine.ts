import {
  planForRule,
  type AllocationDraft,
  type AllocationPlan,
  type DraftAssignment
} from '@shared/allocation'
import { seededSource } from '../codes/random'

// The allocation engine (SPEC.md 4.4). Pure: students, lockers and a plan in; a
// draft out. Nothing is saved until the operator commits the draft.

export interface EngineStudent {
  id: string
  yearLevel: string | null
  group: string | null
  house: string | null
  lastName: string
  firstName: string
  needsAccessible: boolean
  excluded: boolean
  hasLocker: boolean
  lastYearLockerId: string | null
}

export interface EngineLocker {
  id: string
  sortKey: string
  areaId: string
  bankId: string
  areaOrder: number
  bankOrder: number
  row: number | null
  column: number | null
  tier: 'top' | 'middle' | 'bottom' | null
  accessible: boolean
  /** Places left: capacity minus current holders; 0 when out of service or reserved. */
  free: number
}

const collator = new Intl.Collator('en-AU', { sensitivity: 'base', numeric: true })

function byName(a: EngineStudent, b: EngineStudent): number {
  return (
    collator.compare(a.lastName, b.lastName) ||
    collator.compare(a.firstName, b.firstName) ||
    collator.compare(a.id, b.id)
  )
}

function groupRank(groupsLast: readonly string[]) {
  return (g: string | null): [number, number, string] => {
    const i = g === null ? -1 : groupsLast.indexOf(g)
    // Normal groups first (A to Z), then the "last" groups in their given order, then none.
    return g === null ? [2, 0, ''] : i >= 0 ? [1, i, g] : [0, 0, g]
  }
}

export function orderStudents(
  students: readonly EngineStudent[],
  plan: AllocationPlan
): EngineStudent[] {
  const list = [...students]
  const rank = groupRank(plan.groupsLast)
  const byGroup = (a: EngineStudent, b: EngineStudent): number => {
    const ra = rank(a.group)
    const rb = rank(b.group)
    return ra[0] - rb[0] || ra[1] - rb[1] || collator.compare(ra[2], rb[2])
  }
  switch (plan.studentOrder) {
    case 'name':
      return list.sort(byName)
    case 'house_then_name':
      return list.sort((a, b) => collator.compare(a.house ?? '~', b.house ?? '~') || byName(a, b))
    case 'random': {
      const src = seededSource(plan.seed ?? 'random')
      const sorted = list.sort(byName)
      for (let i = sorted.length - 1; i > 0; i--) {
        const j = src.below(i + 1)
        ;[sorted[i], sorted[j]] = [sorted[j]!, sorted[i]!]
      }
      return sorted
    }
    case 'group_then_name':
    case 'keep_last_year':
      return list.sort((a, b) => byGroup(a, b) || byName(a, b))
  }
}

const TIER_ROW: Record<string, number> = { top: 0, middle: 1, bottom: 2 }

export function orderLockers(
  lockers: readonly EngineLocker[],
  plan: AllocationPlan
): EngineLocker[] {
  const list = [...lockers]
  const bySort = (a: EngineLocker, b: EngineLocker): number =>
    a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0
  switch (plan.lockerOrder) {
    case 'number':
      return list.sort(bySort)
    case 'bank_then_number':
      return list.sort(
        (a, b) => a.areaOrder - b.areaOrder || a.bankOrder - b.bankOrder || bySort(a, b)
      )
    case 'column':
      // Fills top, middle and bottom of a column before moving on.
      return list.sort(
        (a, b) =>
          a.areaOrder - b.areaOrder ||
          a.bankOrder - b.bankOrder ||
          (a.column ?? 0) - (b.column ?? 0) ||
          (a.row ?? TIER_ROW[a.tier ?? 'top']!) - (b.row ?? TIER_ROW[b.tier ?? 'top']!) ||
          bySort(a, b)
      )
    case 'tier_preference': {
      const pref =
        plan.tierPreference.length > 0 ? plan.tierPreference : ['middle', 'bottom', 'top']
      const rank = (t: EngineLocker['tier']): number =>
        t === null ? 0 : pref.indexOf(t) < 0 ? pref.length : pref.indexOf(t)
      return list.sort((a, b) => rank(a.tier) - rank(b.tier) || bySort(a, b))
    }
  }
}

/** Keeps the last N lockers of each bank spare (SPEC.md 4.4, "gaps"). */
function dropBankGaps(lockers: readonly EngineLocker[], gap: number): EngineLocker[] {
  if (gap <= 0) return [...lockers]
  const byBank = new Map<string, EngineLocker[]>()
  for (const l of lockers) byBank.set(l.bankId, [...(byBank.get(l.bankId) ?? []), l])
  const drop = new Set<string>()
  for (const list of byBank.values()) {
    const sorted = [...list].sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1))
    for (const l of sorted.slice(Math.max(0, sorted.length - gap))) drop.add(l.id)
  }
  return lockers.filter((l) => !drop.has(l.id))
}

export function allocate(
  students: readonly EngineStudent[],
  lockers: readonly EngineLocker[],
  plan: AllocationPlan
): AllocationDraft {
  const assignments: DraftAssignment[] = []
  const unplaced: AllocationDraft['unplaced'] = []
  const skipped: AllocationDraft['skipped'] = []
  const byRule: AllocationDraft['byRule'] = []
  const placed = new Set<string>()
  const free = new Map(lockers.map((l) => [l.id, l.free]))
  const usedByRule = new Set<string>()

  for (const s of students) {
    if (s.excluded) skipped.push({ studentId: s.id, reason: 'excluded' })
    else if (s.hasLocker) skipped.push({ studentId: s.id, reason: 'has_locker' })
  }
  const eligible = students.filter((s) => !s.excluded && !s.hasLocker)

  for (const rule of plan.rules) {
    const mine = eligible.filter(
      (s) =>
        !placed.has(s.id) &&
        (rule.yearLevels.length === 0 ||
          (s.yearLevel !== null && rule.yearLevels.includes(s.yearLevel))) &&
        (rule.groups.length === 0 || (s.group !== null && rule.groups.includes(s.group)))
    )
    const ruleLockers = lockers.filter(
      (l) =>
        !usedByRule.has(l.id) &&
        (rule.areaIds.length === 0 || rule.areaIds.includes(l.areaId)) &&
        (rule.bankIds.length === 0 || rule.bankIds.includes(l.bankId))
    )
    // Lockers in this rule's range are this rule's alone, so two rules never interleave.
    for (const l of ruleLockers) usedByRule.add(l.id)
    // The line's own order where it has one (Year 7 low tiers, Year 12 keep last year's).
    const p = planForRule(plan, rule)
    const sequence = orderLockers(dropBankGaps(ruleLockers, p.gapAfterBank), p)
    const ordered = orderStudents(mine, p)
    let placedHere = 0
    const place = (s: EngineStudent, l: EngineLocker): void => {
      assignments.push({ studentId: s.id, lockerId: l.id })
      placed.add(s.id)
      free.set(l.id, (free.get(l.id) ?? 0) - 1)
      placedHere++
    }

    // Keep last year's locker where possible.
    if (p.studentOrder === 'keep_last_year') {
      for (const s of ordered) {
        const l = s.lastYearLockerId ? sequence.find((x) => x.id === s.lastYearLockerId) : undefined
        if (l && (free.get(l.id) ?? 0) > 0) place(s, l)
      }
    }
    // Accessible lockers first for students who need one.
    if (plan.accessibleFirst) {
      for (const s of ordered.filter((x) => x.needsAccessible && !placed.has(x.id))) {
        const l = sequence.find((x) => x.accessible && (free.get(x.id) ?? 0) > 0)
        if (l) place(s, l)
      }
    }
    // Everyone else in order; a gap after each group.
    let cursor = 0
    let previousGroup: string | null | undefined
    for (const s of ordered) {
      if (placed.has(s.id)) continue
      if (previousGroup !== undefined && s.group !== previousGroup && p.gapAfterGroup > 0) {
        let skippedSpaces = 0
        while (cursor < sequence.length && skippedSpaces < p.gapAfterGroup) {
          if ((free.get(sequence[cursor]!.id) ?? 0) > 0) skippedSpaces++
          cursor++
        }
      }
      previousGroup = s.group
      while (cursor < sequence.length && (free.get(sequence[cursor]!.id) ?? 0) <= 0) cursor++
      const l = sequence[cursor]
      if (!l) {
        unplaced.push({ studentId: s.id, ruleId: rule.id })
        continue
      }
      place(s, l)
      if ((free.get(l.id) ?? 0) <= 0) cursor++
    }
    byRule.push({
      ruleId: rule.id,
      label: rule.label,
      students: mine.length,
      lockers: ruleLockers.filter((l) => l.free > 0).length,
      placed: placedHere
    })
  }
  for (const s of eligible) {
    if (!placed.has(s.id) && !unplaced.some((u) => u.studentId === s.id))
      skipped.push({ studentId: s.id, reason: 'no_rule' })
  }
  return { assignments, unplaced, skipped, byRule }
}
