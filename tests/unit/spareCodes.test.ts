import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { codeKey, decryptCode, encryptCode } from '../../src/main/codes/cipher'
import { seededSource } from '../../src/main/codes/random'
import type { LockerDb } from '../../src/main/db/db'
import { codeRules, generateYearSet, issueCode, setCodeRules } from '../../src/main/repos/codes'
import { allocatedDemo } from './fixtures'

/** Every code set on a lock right now, whatever the lock's status. */
function liveCodes(db: LockerDb): Set<string> {
  const key = codeKey(db)
  const out = new Set<string>()
  for (const r of db.all<{ code_cipher: Uint8Array }>(
    'SELECT code_cipher FROM lock WHERE code_cipher IS NOT NULL'
  )) {
    const c = decryptCode(key, r.code_cipher)
    if (c) out.add(c)
  }
  return out
}

function codesInSet(db: LockerDb, setId: string): string[] {
  const key = codeKey(db)
  return db
    .all<{ code_cipher: Uint8Array }>(
      'SELECT code_cipher FROM code_set_entry WHERE code_set_id = $s',
      { $s: setId }
    )
    .map((r) => decryptCode(key, r.code_cipher)!)
}

const ROLLBACK = new Error('roll back')

describe('spare codes never match a code on a lock (SPEC.md 4.6)', () => {
  it('a new spare pool never holds a code a lock has now (property)', async () => {
    const { db, ctx } = await allocatedDemo()
    const live = liveCodes(db)
    expect(live.size).toBeGreaterThan(100)
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 12 }),
        fc.integer({ min: 200, max: 800 }),
        (seed, spares) => {
          try {
            db.transaction(() => {
              setCodeRules(db, ctx, { ...codeRules(db), sparePoolSize: spares })
              generateYearSet(db, ctx, { name: 'SYNTHETIC next', schoolYearId: null, seed })
              const spareSet = db.get<{ id: string }>(
                "SELECT id FROM code_set WHERE purpose = 'spares' AND name = 'SYNTHETIC next (spares)'"
              )!.id
              const clash = codesInSet(db, spareSet).filter((c) => live.has(c))
              expect(clash).toEqual([])
              throw ROLLBACK
            })
          } catch (error) {
            if (error !== ROLLBACK) throw error
          }
        }
      ),
      { numRuns: 12 }
    )
  }, 60_000)

  it('each locker’s next-year code still differs from its own lock’s code', async () => {
    const { db, ctx } = await allocatedDemo()
    const key = codeKey(db)
    const r = generateYearSet(db, ctx, { name: 'SYNTHETIC 2027', schoolYearId: null, seed: 'x' })
    const rows = db.all<{ next: Uint8Array; now: Uint8Array | null }>(
      `SELECT e.code_cipher AS next, k.code_cipher AS now FROM code_set_entry e
         JOIN lock k ON k.locker_id = e.locker_id WHERE e.code_set_id = $s`,
      { $s: r.set }
    )
    expect(rows).toHaveLength(r.codes)
    for (const row of rows) expect(decryptCode(key, row.next)).not.toBe(decryptCode(key, row.now))
  })

  it('a spare already in an older file that matches a live code is skipped', async () => {
    const { db, ctx } = await allocatedDemo()
    const key = codeKey(db)
    const live = [...liveCodes(db)]
    // An older file: every existing spare used up, then one that matches a live code.
    db.run("UPDATE code_set_entry SET status = 'used' WHERE status = 'available'")
    const spareSet = db.get<{ id: string }>("SELECT id FROM code_set WHERE purpose = 'spares'")!.id
    for (const [i, code] of [live[0]!, live[1]!].entries())
      db.run(
        `INSERT INTO code_set_entry (id, code_set_id, code_cipher, code_length, status, created_at, updated_at, updated_by)
         VALUES ($id, $s, $c, 4, 'available', 'x', 'x', 'x')`,
        { $id: `clash-${i}`, $s: spareSet, $c: encryptCode(key, code) }
      )
    const lock = db.get<{ id: string }>(
      "SELECT k.id FROM lock k WHERE k.code_status = 'set' AND k.type = 'combination_builtin' AND k.code_cipher IS NOT NULL LIMIT 1"
    )!
    const code = issueCode(db, ctx, lock.id, 'compromised', seededSource('spare'))
    expect(code).not.toBeNull()
    expect(live).not.toContain(code)
    expect(
      db.all("SELECT id FROM code_set_entry WHERE id LIKE 'clash-%' AND status != 'available'")
    ).toEqual([])
  })
})
