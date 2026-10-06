import { createDemoDatabase } from '../../src/main/demo/demoSchool'
import type { LockerDb } from '../../src/main/db/db'
import { commitDraft, draftAllocation, savedPlan } from '../../src/main/repos/assignments'
import { generateYearSet } from '../../src/main/repos/codes'
import { testContext } from './helpers'

/** The SYNTHETIC demo school, allocated by its saved plan, with a code on every lock. */
export async function allocatedDemo() {
  const db: LockerDb = await createDemoDatabase(testContext(), '0.6.0')
  const ctx = testContext()
  generateYearSet(db, ctx, { name: 'SYNTHETIC 2026', schoolYearId: null, seed: 'golden' })
  const { draft } = draftAllocation(db, savedPlan(db))
  const r = commitDraft(db, ctx, draft.assignments, { issueCodes: true })
  return { db, ctx, assigned: r.assigned }
}
