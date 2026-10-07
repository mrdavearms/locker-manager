import { describe, expect, it } from 'vitest'
import { createNewDatabase } from '../../src/main/db/newFile'
import { handlers } from '../../src/main/rpc/handlers'
import { createArea, listAreas, listLockers } from '../../src/main/repos/locations'
import { setSetting } from '../../src/main/repos/settings'
import { setTerms } from '../../src/main/repos/school'
import { DEFAULT_LOCK } from '../../src/shared/locks'
import { DEFAULT_TERMS } from '../../src/shared/terminology'
import { testContext } from './helpers'

// The quick start in set-up: one area, one bank and every locker in one step.

function freshDb() {
  return createNewDatabase(testContext(), { schoolName: 'SYNTHETIC College', appVersion: '0.9.0' })
}

function quickStart() {
  const h = handlers['lockers.quickStart']
  if (h.kind !== 'write') throw new Error('wrong handler kind')
  return h
}

describe('lockers.quickStart', () => {
  it('adds one area, one bank and 40 lockers numbered 1 to 40 in one tier', async () => {
    const ctx = testContext()
    const db = await freshDb()
    const added = quickStart().run(db, ctx, { count: 40, firstNumber: 1, lockType: 'none' })
    expect(added).toBe(40)

    const areas = listAreas(db)
    expect(areas).toHaveLength(1)
    expect(areas[0]?.name).toBe('All lockers')
    expect(areas[0]?.banks).toHaveLength(1)
    expect(areas[0]?.banks[0]?.name).toBe('Bank 1')
    expect(areas[0]?.banks[0]?.lockerCount).toBe(40)

    const lockers = listLockers(db)
    expect(lockers.map((l) => l.number)).toEqual(
      Array.from({ length: 40 }, (_, i) => String(i + 1))
    )
    expect(new Set(lockers.map((l) => l.row))).toEqual(new Set([1]))
    expect(new Set(lockers.map((l) => l.tier))).toEqual(new Set([null]))
  })

  it('numbers from the first number given, with no padding', async () => {
    const ctx = testContext()
    const db = await freshDb()
    expect(quickStart().run(db, ctx, { count: 5, firstNumber: 100, lockType: 'none' })).toBe(5)
    expect(listLockers(db).map((l) => l.number)).toEqual(['100', '101', '102', '103', '104'])
  })

  it('gives every locker a lock of the chosen kind, including no lock', async () => {
    const ctx = testContext()
    const db = await freshDb()
    quickStart().run(db, ctx, { count: 3, firstNumber: 1, lockType: 'none' })
    const locks = db.all<{ type: string; code_status: string; dials: number | null }>(
      'SELECT type, code_status, dials FROM lock'
    )
    expect(locks).toHaveLength(3)
    for (const k of locks) {
      expect(k).toEqual({ type: 'none', code_status: 'not_applicable', dials: null })
    }
    expect(listLockers(db).every((l) => l.lockType === 'none')).toBe(true)
  })

  it('keeps the usual lock details when the chosen kind has a code', async () => {
    const ctx = testContext()
    const db = await freshDb()
    setSetting(db, ctx, 'locks.defaults', {
      ...DEFAULT_LOCK,
      type: 'keyed_padlock',
      dials: 3,
      positionsPerDial: 40,
      manufacturer: 'SYNTHETIC Locks'
    })
    quickStart().run(db, ctx, {
      count: 2,
      firstNumber: 1,
      lockType: 'combination_padlock_settable'
    })
    const locks = db.all<{
      type: string
      code_status: string
      dials: number
      positions_per_dial: number
      manufacturer: string
    }>('SELECT type, code_status, dials, positions_per_dial, manufacturer FROM lock')
    expect(locks).toHaveLength(2)
    for (const k of locks) {
      expect(k).toEqual({
        type: 'combination_padlock_settable',
        code_status: 'reset_no_code',
        dials: 3,
        positions_per_dial: 40,
        manufacturer: 'SYNTHETIC Locks'
      })
    }
  })

  it("names the area and bank with the school's own words", async () => {
    const ctx = testContext()
    const db = await freshDb()
    setTerms(db, ctx, {
      ...DEFAULT_TERMS,
      locker: { one: 'Cubby', many: 'Cubbies' },
      bank: { one: 'Wall', many: 'Walls' }
    })
    quickStart().run(db, ctx, { count: 2, firstNumber: 1, lockType: 'none' })
    const areas = listAreas(db)
    expect(areas[0]?.name).toBe('All cubbies')
    expect(areas[0]?.banks[0]?.name).toBe('Wall 1')
  })

  it('refuses when an area already exists, and adds nothing', async () => {
    const ctx = testContext()
    const db = await freshDb()
    createArea(db, ctx, { name: 'Year 7 side' })
    expect(() =>
      quickStart().run(db, ctx, { count: 10, firstNumber: 1, lockType: 'none' })
    ).toThrow(/already/)
    expect(listAreas(db)).toHaveLength(1)
    expect(listLockers(db)).toHaveLength(0)
  })

  it('writes one history line with the count and lock kind', async () => {
    const h = quickStart()
    const entry = h.audit({ count: 40, firstNumber: 1, lockType: 'none' }, 40)
    expect(entry).toMatchObject({
      action: 'lockers.quick_start',
      after: { count: 40, lock: 'none' }
    })
  })
})
