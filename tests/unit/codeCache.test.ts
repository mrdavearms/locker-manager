import { describe, expect, it } from 'vitest'
import { LOCK_TYPE_INFO, type LockType } from '../../src/shared/locks'
import type { CodeRules } from '../../src/shared/codes'
import { codeKey, decryptCode } from '../../src/main/codes/cipher'
import { seededSource } from '../../src/main/codes/random'
import { codeAt, codeSpace, formatCode } from '../../src/main/codes/rules'
import type { LockerDb } from '../../src/main/db/db'
import { createDemoDatabase } from '../../src/main/demo/demoSchool'
import {
  CodeCache,
  codeRules,
  generateYearSet,
  issueCode,
  setCodeRules,
  takenCodes
} from '../../src/main/repos/codes'
import { testContext } from './helpers'

// Giving out lockers to a whole school works out the codes in use once (CodeCache)
// instead of once per lock. The codes must be exactly the ones the slow way gives.

/** Every code a lock holds now, as the spare check sees them. */
function codesOnLocks(db: LockerDb): Set<string> {
  const key = codeKey(db)
  return new Set(
    db
      .all<{ code_cipher: Uint8Array }>(
        'SELECT code_cipher FROM lock WHERE code_cipher IS NOT NULL'
      )
      .map((r) => decryptCode(key, r.code_cipher)!)
  )
}

/** The cache answers exactly as the slow functions do, for every possible code. */
function expectCacheMatches(db: LockerDb, cache: CodeCache, uniqueness: CodeRules['uniqueness']) {
  const rules = codeRules(db)
  const all = Array.from({ length: codeSpace(rules) }, (_, i) =>
    formatCode(codeAt(i, rules), rules.positions)
  )
  const areas = [null, ...db.all<{ id: string }>('SELECT id FROM area').map((a) => a.id)]
  for (const area of areas) {
    const slow = takenCodes(db, uniqueness, area)
    const fast = cache.taken(uniqueness, area)
    for (const c of new Set([...all, ...slow])) expect(fast.has(c), c).toBe(slow.has(c))
  }
  const slowOn = codesOnLocks(db)
  const fastOn = cache.codesOnLocks()
  for (const c of new Set([...all, ...slowOn])) expect(fastOn.has(c), c).toBe(slowOn.has(c))
}

async function issueEveryCode(
  useCache: boolean,
  uniqueness: CodeRules['uniqueness'],
  sparesOnly: boolean
): Promise<(string | null)[]> {
  const db = await createDemoDatabase(testContext(), '0.6.0')
  const ctx = testContext()
  setCodeRules(db, ctx, { ...codeRules(db), uniqueness })
  if (sparesOnly) {
    // A spare pool but no year codes left: locks take spares, then new codes.
    generateYearSet(db, ctx, { name: 'SYNTHETIC 2026', schoolYearId: null, seed: 'cache' })
    db.run(
      "UPDATE code_set_entry SET status = 'used' WHERE code_set_id IN (SELECT id FROM code_set WHERE purpose = 'year')"
    )
  }
  const locks = db
    .all<{ id: string; type: LockType }>(
      'SELECT k.id, k.type FROM lock k WHERE k.locker_id IS NOT NULL ORDER BY k.rowid'
    )
    .filter((k) => LOCK_TYPE_INFO[k.type].codeSettable)
  const source = seededSource(`cache-${uniqueness}-${sparesOnly}`)
  const cache = useCache ? new CodeCache(db) : undefined
  const out: (string | null)[] = []
  const check = () => {
    if (cache && out.length % 100 === 0) expectCacheMatches(db, cache, uniqueness)
  }
  for (const k of locks) {
    out.push(issueCode(db, ctx, k.id, 'issued', source, cache))
    check()
  }
  // Recoding frees each lock's old code, which the cache must forget too.
  for (const k of locks.slice(0, 60)) {
    out.push(issueCode(db, ctx, k.id, 'compromised', source, cache))
    check()
  }
  if (cache) expectCacheMatches(db, cache, uniqueness)
  return out
}

describe('codes in use worked out once per allocation', () => {
  it.each([
    ['school', false],
    ['area', false],
    ['none', false],
    ['school', true],
    ['area', true]
  ] as const)(
    'gives the same codes with and without the cache (uniqueness %s, spares only %s)',
    async (uniqueness, sparesOnly) => {
      const slow = await issueEveryCode(false, uniqueness, sparesOnly)
      const fast = await issueEveryCode(true, uniqueness, sparesOnly)
      expect(slow.filter((c) => c !== null).length).toBeGreaterThan(200)
      expect(fast).toEqual(slow)
    },
    60_000
  )
})
