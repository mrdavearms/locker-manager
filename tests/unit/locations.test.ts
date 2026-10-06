import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  compareLockerNumbers,
  duplicateNumbers,
  lockerSortKey,
  planBulkLockers
} from '../../src/main/locations/lockerNumbers'
import { createNewDatabase } from '../../src/main/db/newFile'
import {
  addLockers,
  archiveArea,
  archiveBank,
  archiveLocker,
  createArea,
  createBank,
  listAreas,
  listLockers,
  renumberLocker,
  setBankLocks,
  updateLocker
} from '../../src/main/repos/locations'
import {
  getSchoolProfile,
  getTerms,
  setLogo,
  setTerms,
  updateSchoolProfile
} from '../../src/main/repos/school'
import { TERMINOLOGY_PRESETS } from '../../src/shared/terminology'
import { testContext } from './helpers'

describe('locker numbers', () => {
  it('sort the way people expect', () => {
    const list = ['B10', '114', 'B2', '7', '007b', 'A1', '1000', '20']
    expect([...list].sort(compareLockerNumbers)).toEqual([
      '7',
      '007b',
      '20',
      '114',
      '1000',
      'A1',
      'B2',
      'B10'
    ])
  })
  it('sort keys order any two numbers consistently (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 99999 }),
        fc.integer({ min: 0, max: 99999 }),
        (a, b) => {
          expect(Math.sign(compareLockerNumbers(String(a), String(b)))).toBe(Math.sign(a - b))
          expect(lockerSortKey(`B${a}`) < lockerSortKey(`B${b}`)).toBe(a < b)
        }
      )
    )
  })
  it('plan a bank of 114 lockers in 3 tiers, numbered down then across', () => {
    const plan = planBulkLockers({
      prefix: '',
      from: 1,
      to: 114,
      padTo: 0,
      tiers: 3,
      order: 'down_then_across'
    })
    expect(plan).toHaveLength(114)
    expect(plan[0]).toEqual({ number: '1', row: 1, column: 1, tier: 'top' })
    expect(plan[1]).toEqual({ number: '2', row: 2, column: 1, tier: 'middle' })
    expect(plan[2]).toEqual({ number: '3', row: 3, column: 1, tier: 'bottom' })
    expect(plan[113]).toEqual({ number: '114', row: 3, column: 38, tier: 'bottom' })
  })
  it('plan across then down, with a prefix and padding', () => {
    const plan = planBulkLockers({
      prefix: 'B',
      from: 1,
      to: 6,
      padTo: 3,
      tiers: 2,
      order: 'across_then_down'
    })
    expect(plan.map((p) => `${p.number}@${p.row},${p.column}`)).toEqual([
      'B001@1,1',
      'B002@1,2',
      'B003@1,3',
      'B004@2,1',
      'B005@2,2',
      'B006@2,3'
    ])
  })
  it('refuse nonsense ranges', () => {
    expect(() =>
      planBulkLockers({
        prefix: '',
        from: 10,
        to: 1,
        padTo: 0,
        tiers: 1,
        order: 'down_then_across'
      })
    ).toThrow()
    expect(() =>
      planBulkLockers({
        prefix: '',
        from: 1,
        to: 10,
        padTo: 0,
        tiers: 5,
        order: 'down_then_across'
      })
    ).toThrow()
  })
  it('find duplicates, ignoring case', () => {
    expect(duplicateNumbers(['b1', 'B2', 'B2', '3'], ['B1'])).toEqual(
      ['B2', 'b1'].sort(compareLockerNumbers)
    )
  })
})

async function db() {
  return createNewDatabase(testContext(), { schoolName: 'SYNTHETIC College', appVersion: '0.2.0' })
}

describe('areas, banks and lockers', () => {
  it('build the WHS shape: two areas, 114 lockers each, built-in dial locks', async () => {
    const d = await db()
    const ctx = testContext()
    for (const [name, from, to] of [
      ['Year 7 side', 1, 114],
      ['Year 8 side', 115, 228]
    ] as const) {
      const area = createArea(d, ctx, { name, defaultYearLevels: [name.slice(0, 6)] })
      const bank = createBank(d, ctx, { areaId: area, name: `${name} bank` })
      addLockers(d, ctx, {
        bankId: bank,
        planned: planBulkLockers({
          prefix: '',
          from,
          to,
          padTo: 0,
          tiers: 3,
          order: 'down_then_across'
        }),
        lock: { type: 'combination_builtin', dials: 4, positionsPerDial: 10 }
      })
    }
    const areas = listAreas(d)
    expect(
      areas.map((a) => [a.name, a.banks[0]?.lockerCount, a.banks[0]?.columns, a.banks[0]?.rows])
    ).toEqual([
      ['Year 7 side', 114, 38, 3],
      ['Year 8 side', 114, 38, 3]
    ])
    const lockers = listLockers(d)
    expect(lockers).toHaveLength(228)
    expect(lockers[0]?.number).toBe('1')
    expect(lockers[227]?.number).toBe('228')
    expect(
      lockers.every((l) => l.lockType === 'combination_builtin' && l.codeStatus === 'reset_no_code')
    ).toBe(true)
    expect(d.foreignKeyProblems()).toBe(0)
  })

  it('refuse a locker number that is already used', async () => {
    const d = await db()
    const ctx = testContext()
    const bank = createBank(d, ctx, { areaId: createArea(d, ctx, { name: 'A' }), name: 'Bank' })
    addLockers(d, ctx, {
      bankId: bank,
      planned: planBulkLockers({
        prefix: '',
        from: 1,
        to: 5,
        padTo: 0,
        tiers: 1,
        order: 'down_then_across'
      }),
      lock: null
    })
    expect(() =>
      addLockers(d, ctx, {
        bankId: bank,
        planned: planBulkLockers({
          prefix: '',
          from: 5,
          to: 6,
          padTo: 0,
          tiers: 1,
          order: 'down_then_across'
        }),
        lock: null
      })
    ).toThrow(/already used: 5/)
  })

  it('renumber only through the Renumber tool, and never onto another locker', async () => {
    const d = await db()
    const ctx = testContext()
    const bank = createBank(d, ctx, { areaId: createArea(d, ctx, { name: 'A' }), name: 'Bank' })
    addLockers(d, ctx, {
      bankId: bank,
      planned: planBulkLockers({
        prefix: '',
        from: 101,
        to: 113,
        padTo: 0,
        tiers: 1,
        order: 'down_then_across'
      }),
      lock: null
    })
    const l102 = listLockers(d).find((l) => l.number === '102')!
    expect(() => renumberLocker(d, ctx, l102.id, '113')).toThrow(/already exists/)
    expect(renumberLocker(d, ctx, l102.id, '102A')).toEqual({ from: '102', to: '102A' })
    expect(listLockers(d).map((l) => l.number)).toContain('102A')
    expect(d.get("SELECT value FROM meta WHERE key = 'renumber_in_progress'")).toBeUndefined()
  })

  it('out of service needs a reason, and capacity cannot drop below the holders', async () => {
    const d = await db()
    const ctx = testContext()
    const bank = createBank(d, ctx, { areaId: createArea(d, ctx, { name: 'A' }), name: 'Bank' })
    addLockers(d, ctx, {
      bankId: bank,
      planned: planBulkLockers({
        prefix: '',
        from: 1,
        to: 1,
        padTo: 0,
        tiers: 1,
        order: 'down_then_across'
      }),
      lock: null
    })
    const id = listLockers(d)[0]!.id
    expect(() => updateLocker(d, ctx, id, { status: 'out_of_service' })).toThrow(/why/)
    updateLocker(d, ctx, id, { status: 'out_of_service', outOfServiceReason: 'Door hinge broken' })
    expect(listLockers(d)[0]).toMatchObject({
      status: 'out_of_service',
      outOfServiceReason: 'Door hinge broken'
    })
    updateLocker(d, ctx, id, { status: 'in_service' })
    expect(listLockers(d)[0]).toMatchObject({ status: 'in_service', outOfServiceReason: null })
    expect(() => updateLocker(d, ctx, id, { capacity: 0 })).toThrow()
  })

  it('archive only what is empty', async () => {
    const d = await db()
    const ctx = testContext()
    const area = createArea(d, ctx, { name: 'A' })
    const bank = createBank(d, ctx, { areaId: area, name: 'Bank' })
    addLockers(d, ctx, {
      bankId: bank,
      planned: planBulkLockers({
        prefix: '',
        from: 1,
        to: 2,
        padTo: 0,
        tiers: 1,
        order: 'down_then_across'
      }),
      lock: null
    })
    expect(() => archiveArea(d, ctx, area)).toThrow(/banks/)
    expect(() => archiveBank(d, ctx, bank)).toThrow(/lockers/)
    for (const l of listLockers(d)) archiveLocker(d, ctx, l.id)
    archiveBank(d, ctx, bank)
    archiveArea(d, ctx, area)
    expect(listAreas(d)).toEqual([])
  })

  it('change a bank to keyed padlocks, clearing any code', async () => {
    const d = await db()
    const ctx = testContext()
    const bank = createBank(d, ctx, { areaId: createArea(d, ctx, { name: 'A' }), name: 'Bank' })
    addLockers(d, ctx, {
      bankId: bank,
      planned: planBulkLockers({
        prefix: '',
        from: 1,
        to: 3,
        padTo: 0,
        tiers: 1,
        order: 'down_then_across'
      }),
      lock: { type: 'combination_builtin', dials: 4, positionsPerDial: 10 }
    })
    expect(
      setBankLocks(d, ctx, bank, { type: 'keyed_padlock', dials: 4, positionsPerDial: 10 })
    ).toBe(3)
    expect(
      listLockers(d).every(
        (l) => l.lockType === 'keyed_padlock' && l.codeStatus === 'not_applicable'
      )
    ).toBe(true)
  })
})

describe('the school profile', () => {
  it('updates colours and checks they are colours', async () => {
    const d = await db()
    const ctx = testContext()
    updateSchoolProfile(d, ctx, { colourPrimary: '#1F3864', colourStripes: ['#E36F1E', '#2E8B57'] })
    expect(getSchoolProfile(d)).toMatchObject({
      colourPrimary: '#1F3864',
      colourStripes: ['#E36F1E', '#2E8B57']
    })
    expect(() => updateSchoolProfile(d, ctx, { colourAccent: 'navy' })).toThrow(/not a colour/)
  })
  it('stores a logo and its mono version', async () => {
    const d = await db()
    setLogo(d, testContext(), 'colour', new Uint8Array([137, 80, 78, 71]), 'image/png')
    expect(getSchoolProfile(d)).toMatchObject({
      hasLogo: true,
      hasMonoLogo: false,
      logoDataUrl: 'data:image/png;base64,iVBORw=='
    })
    expect(() =>
      setLogo(d, testContext(), 'mono', new Uint8Array(3 * 1024 * 1024), 'image/png')
    ).toThrow(/2 MB/)
  })
  it('keeps terminology, falling back to defaults', async () => {
    const d = await db()
    expect(getTerms(d).group.one).toBe('Homeroom')
    const nsw = TERMINOLOGY_PRESETS.find((p) => p.id === 'nsw')!
    setTerms(d, testContext(), nsw.terms)
    expect(getTerms(d).group).toEqual({ one: 'Roll class', many: 'Roll classes' })
  })
})
