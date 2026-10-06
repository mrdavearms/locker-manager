import type { CodeRules } from '@shared/codes'

// Pure rules for lock codes (SPEC.md 4.6). A code is a list of dial values.
// 0-9 dials print as "4721"; wider dials print as "12-35-07".

export type Code = readonly number[]

export function formatCode(code: Code, positions: number): string {
  return positions <= 10 ? code.join('') : code.map((n) => String(n).padStart(2, '0')).join('-')
}

export function parseCode(
  text: string,
  rules: Pick<CodeRules, 'length' | 'positions'>
): Code | null {
  const t = text.trim()
  const parts = rules.positions <= 10 ? t.replace(/\s+/g, '').split('') : t.split(/[\s-]+/)
  if (parts.length !== rules.length) return null
  const nums = parts.map((p) => (/^\d+$/.test(p) ? Number(p) : NaN))
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n >= rules.positions)) return null
  return nums
}

function isRun(code: Code): boolean {
  if (code.length < 3) return false
  const up = code.every((n, i) => i === 0 || n === code[i - 1]! + 1)
  const down = code.every((n, i) => i === 0 || n === code[i - 1]! - 1)
  return up || down
}

function maxSame(code: Code): number {
  const counts = new Map<number, number>()
  for (const n of code) counts.set(n, (counts.get(n) ?? 0) + 1)
  return Math.max(...counts.values())
}

/** Every reason this code breaks the rules; empty means it is allowed. */
export function codeProblems(
  code: Code,
  rules: CodeRules,
  previous: ReadonlySet<string> = new Set()
): string[] {
  const out: string[] = []
  const text = formatCode(code, rules.positions)
  if (code.length !== rules.length) out.push('length')
  if (rules.banAllSame && code.every((n) => n === code[0])) out.push('banAllSame')
  if (rules.banThreeOfOne && maxSame(code) >= 3) out.push('banThreeOfOne')
  if (rules.banRuns && isRun(code)) out.push('banRuns')
  if (
    rules.banRepeatedPairs &&
    code.length % 2 === 0 &&
    code.length >= 4 &&
    code.every((n, i) => n === code[i % 2])
  )
    out.push('banRepeatedPairs')
  if (
    rules.banDoubledPairs &&
    code.length % 2 === 0 &&
    code.length >= 4 &&
    code.every((n, i) => i % 2 === 1 || n === code[i + 1])
  )
    out.push('banDoubledPairs')
  if (rules.positions === 10 && code.length === 4) {
    const v = Number(text)
    if (rules.banYears && v >= 1900 && v <= 2099) out.push('banYears')
    if (rules.banDates) {
      const a = Number(text.slice(0, 2))
      const b = Number(text.slice(2))
      const dayMonth = (d: number, m: number): boolean => d >= 1 && d <= 31 && m >= 1 && m <= 12
      if (dayMonth(a, b) || dayMonth(b, a)) out.push('banDates')
    }
  }
  // One dial away from the reset code 0 0 0 0 (lock makers warn these are insecure).
  if (rules.banNearReset && code.filter((n) => n !== 0).length <= 1) out.push('banNearReset')
  if (rules.banLeadingZero && code[0] === 0) out.push('banLeadingZero')
  if (rules.blocklist.includes(text)) out.push('blocklist')
  if (rules.banPrevious && previous.has(text)) out.push('banPrevious')
  return out
}

export function isValidCode(code: Code, rules: CodeRules, previous?: ReadonlySet<string>): boolean {
  return codeProblems(code, rules, previous).length === 0
}

export function codeSpace(rules: Pick<CodeRules, 'length' | 'positions'>): number {
  return rules.positions ** rules.length
}

/** The nth code in counting order (0 -> 0000, 1 -> 0001 …). */
export function codeAt(index: number, rules: Pick<CodeRules, 'length' | 'positions'>): Code {
  const out: number[] = new Array<number>(rules.length).fill(0)
  let i = index
  for (let p = rules.length - 1; p >= 0; p--) {
    out[p] = i % rules.positions
    i = Math.floor(i / rules.positions)
  }
  return out
}

const EXACT_LIMIT = 2_000_000

/** How many codes the rules allow (exact up to two million; estimated above that). */
export function countValidCodes(
  rules: CodeRules,
  random: () => number = Math.random
): { count: number; estimated: boolean } {
  const space = codeSpace(rules)
  if (space <= EXACT_LIMIT) {
    let n = 0
    for (let i = 0; i < space; i++) if (isValidCode(codeAt(i, rules), rules)) n++
    return { count: n, estimated: false }
  }
  const samples = 200_000
  let ok = 0
  for (let s = 0; s < samples; s++)
    if (isValidCode(codeAt(Math.floor(random() * space), rules), rules)) ok++
  return { count: Math.round((ok / samples) * space), estimated: true }
}
