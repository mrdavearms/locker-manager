// Locker numbers are text ("B12", "007", "114"), with a sort key that orders them
// the way people expect: B2 before B10, and 7 before 114. Pure functions.

/** "B12" -> "B|0000000012"; "007" -> "0000000007"; "12a" -> "0000000012|a". */
export function lockerSortKey(number: string): string {
  const parts = number.trim().match(/\d+|\D+/g) ?? []
  return parts
    .map((p) => (/^\d+$/.test(p) ? p.replace(/^0+(?=\d)/, '').padStart(10, '0') : p.toLowerCase()))
    .join('|')
}

export function compareLockerNumbers(a: string, b: string): number {
  const ka = lockerSortKey(a)
  const kb = lockerSortKey(b)
  return ka < kb ? -1 : ka > kb ? 1 : a.localeCompare(b)
}

export type Tier = 'top' | 'middle' | 'bottom'

export interface BulkPlanInput {
  prefix: string
  from: number
  to: number
  /** Zero-pad numbers to this many digits (0 = no padding). */
  padTo: number
  /** Lockers stacked in each column: 1, 2, 3 or 4. */
  tiers: number
  /** Numbering runs down each column then across (the usual), or across each row then down. */
  order: 'down_then_across' | 'across_then_down'
}

export interface PlannedLocker {
  number: string
  row: number
  column: number
  tier: Tier | null
}

export const MAX_BULK = 5000

function tierName(row: number, tiers: number): Tier | null {
  if (tiers <= 1) return null
  if (row === 1) return 'top'
  if (row === tiers) return 'bottom'
  return 'middle'
}

/** "Lockers 1 to 114, 3 tiers": where each one sits. */
export function planBulkLockers(input: BulkPlanInput): PlannedLocker[] {
  const { prefix, from, to, padTo, tiers, order } = input
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from)
    throw new Error('The numbers must run from a smaller whole number to a larger one.')
  if (to - from + 1 > MAX_BULK) throw new Error(`At most ${MAX_BULK} lockers can be added at once.`)
  if (!Number.isInteger(tiers) || tiers < 1 || tiers > 4)
    throw new Error('A column holds 1 to 4 lockers.')
  const count = to - from + 1
  const columns = Math.ceil(count / tiers)
  const out: PlannedLocker[] = []
  for (let i = 0; i < count; i++) {
    const n = from + i
    const text = `${prefix}${padTo > 0 ? String(n).padStart(padTo, '0') : String(n)}`
    let row: number
    let column: number
    if (order === 'down_then_across') {
      column = Math.floor(i / tiers) + 1
      row = (i % tiers) + 1
    } else {
      row = Math.floor(i / columns) + 1
      column = (i % columns) + 1
    }
    out.push({ number: text, row, column, tier: tierName(row, tiers) })
  }
  return out
}

/** Numbers that would collide with existing lockers or with each other. */
export function duplicateNumbers(
  planned: readonly string[],
  existing: readonly string[]
): string[] {
  const seen = new Set(existing.map((n) => n.trim().toLowerCase()))
  const dupes = new Set<string>()
  for (const n of planned) {
    const key = n.trim().toLowerCase()
    if (seen.has(key)) dupes.add(n)
    seen.add(key)
  }
  return [...dupes].sort(compareLockerNumbers)
}

/** A short random identifier for QR codes (SPEC.md 5.6): no names, no codes. */
export function qrIdentifier(random: () => number = Math.random): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
  let s = ''
  for (let i = 0; i < 8; i++) s += alphabet[Math.floor(random() * alphabet.length)]
  return s
}
