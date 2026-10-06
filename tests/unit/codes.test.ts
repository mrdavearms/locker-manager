import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CODE_RULES, type CodeRules } from '../../src/shared/codes'
import { createNewDatabase } from '../../src/main/db/newFile'
import { codeKey, decryptCode, encryptCode } from '../../src/main/codes/cipher'
import { generateCodes } from '../../src/main/codes/generate'
import { seededSource, secureSource } from '../../src/main/codes/random'
import {
  codeAt,
  codeProblems,
  countValidCodes,
  formatCode,
  isValidCode,
  parseCode
} from '../../src/main/codes/rules'
import { testContext } from './helpers'

const R = DEFAULT_CODE_RULES
const p = (s: string) => parseCode(s, R)!

describe('code rules (SPEC.md 4.6, section 15 item 18)', () => {
  it.each([
    ['1111', 'banAllSame'],
    ['1511', 'banThreeOfOne'],
    ['1234', 'banRuns'],
    ['9876', 'banRuns'],
    ['1212', 'banRepeatedPairs'],
    ['1122', 'banDoubledPairs'],
    ['1987', 'banYears'],
    ['2026', 'banYears'],
    ['1000', 'banNearReset'],
    ['0001', 'banNearReset'],
    ['0472', 'banLeadingZero']
  ])('refuses %s (%s)', (code, rule) => {
    expect(codeProblems(p(code), R)).toContain(rule)
  })
  it('accepts an ordinary code', () => {
    expect(codeProblems(p('4721'), R)).toEqual([])
  })
  it('refuses birthdays only when that rule is on', () => {
    expect(isValidCode(p('3112'), R)).toBe(true)
    expect(codeProblems(p('3112'), { ...R, banDates: true })).toContain('banDates')
    expect(codeProblems(p('1231'), { ...R, banDates: true })).toContain('banDates')
  })
  it('refuses a lock’s own previous code, and the blocklist', () => {
    expect(codeProblems(p('4721'), R, new Set(['4721']))).toContain('banPrevious')
    expect(codeProblems(p('4721'), { ...R, blocklist: ['4721'] })).toContain('blocklist')
  })
  it('handles rotary padlocks with 3 numbers from 0 to 39', () => {
    const rotary: CodeRules = { ...R, length: 3, positions: 40, banYears: false }
    const code = parseCode('12-35-07', rotary)!
    expect(formatCode(code, 40)).toBe('12-35-07')
    expect(isValidCode(code, rotary)).toBe(true)
    expect(parseCode('12-40-07', rotary)).toBeNull()
  })
  it('counts the codes the WHS-style rules allow', () => {
    const { count, estimated } = countValidCodes(R)
    expect(estimated).toBe(false)
    expect(count).toBeGreaterThan(7000)
    expect(count).toBeLessThan(9000)
  })
})

describe('code generation (property tests, SPEC.md 12)', () => {
  it('every generated code obeys every enabled rule, and a set never repeats', () => {
    fc.assert(
      fc.property(
        fc.record({
          banAllSame: fc.boolean(),
          banThreeOfOne: fc.boolean(),
          banRuns: fc.boolean(),
          banRepeatedPairs: fc.boolean(),
          banDoubledPairs: fc.boolean(),
          banYears: fc.boolean(),
          banDates: fc.boolean(),
          banNearReset: fc.boolean(),
          banLeadingZero: fc.boolean()
        }),
        fc.integer({ min: 4, max: 5 }),
        fc.integer({ min: 1, max: 300 }),
        fc.string({ minLength: 1, maxLength: 12 }),
        (flags, length, n, seed) => {
          const rules: CodeRules = { ...R, ...flags, length }
          const codes = generateCodes(n, rules, seededSource(seed), { taken: new Set() })
          expect(new Set(codes).size).toBe(codes.length)
          for (const c of codes) expect(codeProblems(parseCode(c, rules)!, rules)).toEqual([])
        }
      ),
      { numRuns: 60 }
    )
  })

  it('no locker repeats last year’s code', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 8 }), (seed) => {
        const lastYear = generateCodes(228, R, seededSource(`${seed}-2026`), { taken: new Set() })
        const nextYear = generateCodes(228, R, seededSource(`${seed}-2027`), {
          taken: new Set(),
          avoidPerSlot: lastYear.map((c) => new Set([c]))
        })
        nextYear.forEach((c, i) => expect(c).not.toBe(lastYear[i]))
      }),
      { numRuns: 30 }
    )
  })

  it('is identical for the same seed (reproducible test sets) and different for the secure source', () => {
    expect(generateCodes(50, R, seededSource('check'), { taken: new Set() })).toEqual(
      generateCodes(50, R, seededSource('check'), { taken: new Set() })
    )
    expect(generateCodes(50, R, secureSource, { taken: new Set() })).not.toEqual(
      generateCodes(50, R, secureSource, { taken: new Set() })
    )
  })

  it('says plainly when the rules leave too few codes', () => {
    const tiny: CodeRules = { ...R, length: 3, positions: 2, banRuns: false, banNearReset: false }
    expect(() => generateCodes(20, tiny, seededSource('x'), { taken: new Set() })).toThrow(
      /too few codes/
    )
  })

  it('walks every code in order', () => {
    expect(formatCode(codeAt(0, R), 10)).toBe('0000')
    expect(formatCode(codeAt(4721, R), 10)).toBe('4721')
  })
})

describe('codes at rest (SPEC.md 8.6)', () => {
  it('are encrypted with a key kept in the file, and read back', async () => {
    const db = await createNewDatabase(testContext(), {
      schoolName: 'SYNTHETIC',
      appVersion: '0.4.0'
    })
    const key = codeKey(db)
    expect(codeKey(db).equals(key)).toBe(true)
    const blob = encryptCode(key, '4721')
    expect(Buffer.from(blob).includes(Buffer.from('4721'))).toBe(false)
    expect(decryptCode(key, blob)).toBe('4721')
    expect(decryptCode(key, null)).toBeNull()
  })
})
