import type { CodeRules } from '@shared/codes'
import { codeAt, codeSpace, formatCode, isValidCode } from './rules'
import type { IntSource } from './random'

export interface GenerateOptions {
  /** Codes already in use that must not be issued again (uniqueness). */
  taken: ReadonlySet<string>
  /** Per slot (for example per locker): codes that slot must not get, such as last year's. */
  avoidPerSlot?: readonly (ReadonlySet<string> | undefined)[]
}

/**
 * n codes that obey the rules, are unique among themselves and against `taken`,
 * and never repeat a slot's own past codes. Throws plainly if the rules leave
 * too few codes.
 */
export function generateCodes(
  n: number,
  rules: CodeRules,
  source: IntSource,
  opts: GenerateOptions
): string[] {
  const space = codeSpace(rules)
  const used = new Set(opts.taken)
  const out: string[] = []
  for (let slot = 0; slot < n; slot++) {
    const avoid = opts.avoidPerSlot?.[slot]
    let found: string | null = null
    for (let attempt = 0; attempt < 5000 && found === null; attempt++) {
      const code = codeAt(source.below(space), rules)
      const text = formatCode(code, rules.positions)
      if (used.has(text) || avoid?.has(text)) continue
      if (isValidCode(code, rules, avoid)) found = text
    }
    if (found === null) {
      // Random tries have run dry: walk the whole space from a random start.
      const start = source.below(space)
      for (let k = 0; k < space && found === null; k++) {
        const code = codeAt((start + k) % space, rules)
        const text = formatCode(code, rules.positions)
        if (!used.has(text) && !avoid?.has(text) && isValidCode(code, rules, avoid)) found = text
      }
    }
    if (found === null)
      throw new Error(
        `The code rules leave too few codes: only ${out.length} of the ${n} needed could be made. Relax a rule or allow longer codes.`
      )
    used.add(found)
    out.push(found)
  }
  return out
}
