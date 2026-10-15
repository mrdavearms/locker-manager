import { describe, expect, it } from 'vitest'
import { DEFAULT_CODE_RULES } from '../../src/shared/codes'
import { createDemoDatabase } from '../../src/main/demo/demoSchool'
import { generateYearSet } from '../../src/main/repos/codes'
import { lockerHandlers } from '../../src/main/rpc/lockerHandlers'
import { testContext } from './helpers'

// The "more than half the codes" warning in Settings, Lock codes must be right before
// the first code set is made (spec audit gap 10). The demo school is SYNTHETIC.

const preview = lockerHandlers['codes.rules.preview']
if (preview.kind !== 'read') throw new Error('codes.rules.preview reads the open file')

describe('the more-than-half warning for code rules', () => {
  it('counts the lockers that take a code, before any code set exists', async () => {
    const db = await createDemoDatabase(testContext(), '0.11.2')
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM code_set')!.n).toBe(0)
    // Three-number codes with 300 spares: the demo's lockers plus spares pass half of them.
    const short = { ...DEFAULT_CODE_RULES, length: 3, sparePoolSize: 300 }
    const r = preview.run(db, { rules: short })
    expect(r.lockers).toBeGreaterThan(0)
    expect(r.overHalf).toBe(r.lockers + short.sparePoolSize > r.validCount / 2)
    expect(r.overHalf).toBe(true)
    expect(preview.run(db, { rules: DEFAULT_CODE_RULES }).overHalf).toBe(false)
  })

  it('agrees with the code set maker', async () => {
    const db = await createDemoDatabase(testContext(), '0.11.2')
    const before = preview.run(db, { rules: DEFAULT_CODE_RULES })
    const made = generateYearSet(db, testContext(), {
      name: 'SYNTHETIC',
      schoolYearId: null,
      seed: 'x'
    })
    expect(before.lockers).toBe(made.codes)
    expect(before.overHalf).toBe(made.overHalf)
  })
})
