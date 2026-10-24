import { describe, expect, it } from 'vitest'
import { createDemoDatabase } from '../../src/main/demo/demoSchool'
import { LockerDb } from '../../src/main/db/db'
import { codeKey, decryptCode } from '../../src/main/codes/cipher'
import { seededSource } from '../../src/main/codes/random'
import { commitDraft, draftAllocation, savedPlan } from '../../src/main/repos/assignments'
import {
  codeRules,
  generateYearSet,
  inCodeBatch,
  issueCode,
  setCodeRules
} from '../../src/main/repos/codes'
import { testContext } from './helpers'

// A batch of codes (a whole allocation) reads the codes already in use once and
// keeps them up to date itself (docs/audits/2026-10-09-large-school.md). It must
// give exactly the codes the one-lock-at-a-time path gives.

type Setup = (db: LockerDb) => void

async function twoCopies(setup: Setup): Promise<[LockerDb, LockerDb]> {
  const db = await createDemoDatabase(testContext(), '0.12.0')
  setup(db)
  const bytes = db.export()
  return [await LockerDb.fromBytes(bytes), await LockerDb.fromBytes(bytes)]
}

function settableLocks(db: LockerDb): string[] {
  return db
    .all<{ id: string }>(
      "SELECT id FROM lock WHERE type IN ('combination_builtin','combination_padlock_settable','electronic') AND status IN ('in_use','spare') ORDER BY id"
    )
    .map((r) => r.id)
}

function issueAll(db: LockerDb, lockIds: string[]): (string | null)[] {
  const ctx = testContext()
  const source = seededSource('batch')
  return lockIds.map((id) => issueCode(db, ctx, id, 'compromised', source))
}

async function expectSameCodes(setup: Setup): Promise<void> {
  const [plain, batched] = await twoCopies(setup)
  // 120 locks: past the 100-code spare pool, and quick enough to run the slow path twice.
  const locks = settableLocks(plain).slice(0, 120)
  expect(locks.length).toBe(120)
  const one = issueAll(plain, locks)
  const two = inCodeBatch(batched, () => issueAll(batched, locks))
  expect(two).toEqual(one)
  // Run twice in a row on the same locks, so codes written by the batch must be
  // seen as taken by later locks in it.
  expect(inCodeBatch(batched, () => issueAll(batched, locks))).toEqual(issueAll(plain, locks))
}

describe(
  'issuing codes in a batch gives the same codes as one at a time',
  { timeout: 60_000 },
  () => {
    it('with no code set, so every code is newly made', async () => {
      await expectSameCodes(() => undefined)
    })

    it('with only spare codes, used up part way through', async () => {
      await expectSameCodes((db) => {
        generateYearSet(db, testContext(), { name: 'SYNTHETIC', schoolYearId: null, seed: 'x' })
        db.run(
          "UPDATE code_set_entry SET status = 'void' WHERE code_set_id IN (SELECT id FROM code_set WHERE purpose = 'year')"
        )
      })
    })

    it('with codes unique within each area', async () => {
      await expectSameCodes((db) => {
        const ctx = testContext()
        setCodeRules(db, ctx, { ...codeRules(db), uniqueness: 'area' })
      })
    })

    it('a whole allocation with codes still gives every lock its own code', async () => {
      const db = await createDemoDatabase(testContext(), '0.12.0')
      const ctx = testContext()
      const { draft } = draftAllocation(db, savedPlan(db))
      const r = commitDraft(db, ctx, draft.assignments, { issueCodes: true })
      expect(r.codes).toBeGreaterThan(100)
      const key = codeKey(db)
      const codes = db
        .all<{ code_cipher: Uint8Array }>(
          "SELECT code_cipher FROM lock WHERE code_cipher IS NOT NULL AND status IN ('in_use','spare')"
        )
        .map((x) => decryptCode(key, x.code_cipher))
      expect(codes.length).toBeGreaterThanOrEqual(r.codes)
      expect(new Set(codes).size).toBe(codes.length)
    })
  }
)
