import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  AllocationPlanSchema,
  DEFAULT_PLAN,
  usualOrder,
  type AllocationPlan,
  type AllocationRule,
  type RuleOrder
} from '../../src/shared/allocation'
import { allocate, type EngineLocker, type EngineStudent } from '../../src/main/allocate/engine'
import { createDemoDatabase, generateDemoSchool } from '../../src/main/demo/demoSchool'
import { decryptCode, codeKey } from '../../src/main/codes/cipher'
import {
  assignStudent,
  commitDraft,
  draftAllocation,
  moveStudent,
  releaseStudent,
  lockerFitsPlan,
  savePlan,
  savedPlan,
  suggestLocker,
  swapStudents
} from '../../src/main/repos/assignments'
import {
  generateYearSet,
  issueCode,
  markResetDone,
  markResetDoneMany,
  resetTasks,
  revealCode
} from '../../src/main/repos/codes'
import type { LockerDb } from '../../src/main/db/db'
import { updateStudent } from '../../src/main/repos/students'
import { testContext } from './helpers'

async function demo(): Promise<LockerDb> {
  return createDemoDatabase(testContext(), '0.4.0')
}

function lockerNumber(db: LockerDb, id: string): number {
  return Number(
    db.get<{ number: string }>('SELECT number FROM locker WHERE id = $id', { $id: id })?.number
  )
}

function student(db: LockerDb, id: string) {
  return db.get<{
    external_id: string
    year_level: string
    group_code: string
    last_name: string
    first_name: string
  }>('SELECT * FROM student WHERE id = $id', { $id: id })!
}

describe('golden allocation: a synthetic school shaped like WHS (SPEC.md section 12)', () => {
  it('fills Year 7 into 1 to 114 and Year 8 into 115 to 228, Homerooms A to E then HUB, A to Z by surname, ZZZ never', async () => {
    const db = await demo()
    const plan = savedPlan(db)
    expect(plan.rules.map((r) => [r.label, r.yearLevels])).toEqual([
      ['Year 7 side', ['7']],
      ['Year 8 side', ['8']]
    ])
    expect(plan.groupsLast).toEqual(['HUB'])
    const { draft } = draftAllocation(db, plan)
    const school = generateDemoSchool()
    const eligible = school.students.filter((s) => s.groupCode !== 'ZZZ')
    expect(draft.assignments).toHaveLength(eligible.length)
    expect(draft.unplaced).toEqual([])
    expect(draft.skipped.filter((s) => s.reason === 'excluded')).toHaveLength(
      school.students.length - eligible.length
    )

    const rows = draft.assignments
      .map((a) => ({ n: lockerNumber(db, a.lockerId), ...student(db, a.studentId) }))
      .sort((a, b) => a.n - b.n)
    for (const year of ['7', '8']) {
      const side = rows.filter((r) => r.year_level === year)
      const [lo, hi] = year === '7' ? [1, 114] : [115, 228]
      expect(side.every((r) => r.n >= lo && r.n <= hi)).toBe(true)
      // Contiguous from the first locker of the side, no holes.
      expect(side.map((r) => r.n)).toEqual(side.map((_, i) => lo + i))
      // Group order: A, B, C, D, E, then HUB last.
      const groups = side.map((r) => r.group_code)
      const firstHub = groups.indexOf('HUB')
      expect(groups.slice(firstHub).every((g) => g === 'HUB')).toBe(true)
      expect([...new Set(groups)]).toEqual([
        `0${year}A`,
        `0${year}B`,
        `0${year}C`,
        `0${year}D`,
        `0${year}E`,
        'HUB'
      ])
      // A to Z by surname inside each group.
      const collator = new Intl.Collator('en-AU', { sensitivity: 'base' })
      for (const g of new Set(groups)) {
        const names = side
          .filter((r) => r.group_code === g)
          .map((r) => `${r.last_name}|${r.first_name}`)
        expect(names).toEqual(
          [...names].sort(
            (a, b) =>
              collator.compare(a.split('|')[0]!, b.split('|')[0]!) ||
              collator.compare(a.split('|')[1]!, b.split('|')[1]!)
          )
        )
      }
    }
    expect(rows.some((r) => r.group_code === 'ZZZ')).toBe(false)
    // The checked reference allocation: the first and last three lockers of each side.
    const line = (r: (typeof rows)[number]) =>
      `${r.n} ${r.group_code} ${r.last_name}, ${r.first_name}`
    const y7 = rows.filter((r) => r.year_level === '7')
    const y8 = rows.filter((r) => r.year_level === '8')
    expect(
      [...y7.slice(0, 3), ...y7.slice(-3), ...y8.slice(0, 3), ...y8.slice(-3)].map(line)
    ).toMatchSnapshot()
  })
})

function students(n: number, seed = 1): EngineStudent[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    yearLevel: '7',
    group: `07${'ABC'[(i * 7 + seed) % 3]}`,
    house: null,
    lastName: `Name${(i * 31 + seed) % 97}`,
    firstName: 'X',
    needsAccessible: i % 17 === 0,
    excluded: false,
    hasLocker: false,
    lastYearLockerId: null
  }))
}

function lockers(n: number, capacity = 1): EngineLocker[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `l${i}`,
    sortKey: String(i).padStart(6, '0'),
    areaId: 'a',
    bankId: i < n / 2 ? 'b1' : 'b2',
    areaOrder: 0,
    bankOrder: i < n / 2 ? 0 : 1,
    row: (i % 3) + 1,
    column: Math.floor(i / 3) + 1,
    tier: (['top', 'middle', 'bottom'] as const)[i % 3]!,
    accessible: i % 10 === 9,
    free: capacity
  }))
}

const plan = (p: Partial<AllocationPlan> = {}): AllocationPlan => ({
  ...DEFAULT_PLAN,
  rules: [{ id: 'r', label: 'All', yearLevels: [], groups: [], areaIds: [], bankIds: [] }],
  ...p
})

describe('the allocation engine (properties)', () => {
  it('never gives a locker more students than it holds, never places a student twice, and places as many as fit', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 120 }),
        fc.integer({ min: 0, max: 120 }),
        fc.integer({ min: 1, max: 2 }),
        fc.constantFrom('number', 'bank_then_number', 'column', 'tier_preference'),
        fc.integer({ min: 0, max: 3 }),
        fc.integer({ min: 0, max: 3 }),
        (ns, nl, cap, order, gapG, gapB) => {
          const d = allocate(
            students(ns),
            lockers(nl, cap),
            plan({
              lockerOrder: order as AllocationPlan['lockerOrder'],
              gapAfterGroup: gapG,
              gapAfterBank: gapB
            })
          )
          const perLocker = new Map<string, number>()
          for (const a of d.assignments)
            perLocker.set(a.lockerId, (perLocker.get(a.lockerId) ?? 0) + 1)
          expect([...perLocker.values()].every((v) => v <= cap)).toBe(true)
          expect(new Set(d.assignments.map((a) => a.studentId)).size).toBe(d.assignments.length)
          expect(d.assignments.length + d.unplaced.length).toBe(ns)
          if (gapG === 0 && gapB === 0) expect(d.assignments.length).toBe(Math.min(ns, nl * cap))
        }
      ),
      { numRuns: 150 }
    )
  })

  it('stops and lists who misses out when there are more students than lockers', () => {
    const d = allocate(students(12), lockers(10), plan())
    expect(d.assignments).toHaveLength(10)
    expect(d.unplaced).toHaveLength(2)
  })

  it('gives accessible lockers to students who need one first', () => {
    const d = allocate(students(30), lockers(40), plan({ accessibleFirst: true }))
    const needing = students(30)
      .filter((s) => s.needsAccessible)
      .map((s) => s.id)
    const acc = new Set(
      lockers(40)
        .filter((l) => l.accessible)
        .map((l) => l.id)
    )
    for (const id of needing)
      expect(acc.has(d.assignments.find((a) => a.studentId === id)!.lockerId)).toBe(true)
  })

  it('leaves spare lockers after each group when asked', () => {
    const d = allocate(students(9), lockers(20), plan({ gapAfterGroup: 2, accessibleFirst: false }))
    const used = d.assignments.map((a) => Number(a.lockerId.slice(1))).sort((a, b) => a - b)
    expect(used[used.length - 1]).toBe(8 + 2 * 2)
  })

  it('keeps last year’s locker where possible', () => {
    const s = students(3).map((x, i) => ({ ...x, lastYearLockerId: `l${10 - i}` }))
    const d = allocate(
      s,
      lockers(12),
      plan({ studentOrder: 'keep_last_year', accessibleFirst: false })
    )
    expect(d.assignments.map((a) => [a.studentId, a.lockerId]).sort()).toEqual([
      ['s0', 'l10'],
      ['s1', 'l9'],
      ['s2', 'l8']
    ])
  })

  it('a random order is the same for the same seed', () => {
    const a = allocate(students(40), lockers(40), plan({ studentOrder: 'random', seed: 'x' }))
    const b = allocate(students(40), lockers(40), plan({ studentOrder: 'random', seed: 'x' }))
    expect(a).toEqual(b)
  })
})

// A Year 7 side (l0 to l29) and a Year 8 side (ml0 to ml29), each 3 tiers, numbered in order.
function twoSides(): EngineLocker[] {
  return [
    ...lockers(30).map((l) => ({ ...l, areaId: 'a7' })),
    ...lockers(30).map((l) => ({
      ...l,
      id: `m${l.id}`,
      sortKey: `1${l.sortKey}`,
      areaId: 'a8',
      areaOrder: 1
    }))
  ]
}

function line(id: string, years: string[], areaId: string, order?: RuleOrder): AllocationRule {
  return {
    id,
    label: id,
    yearLevels: years,
    groups: [],
    areaIds: [areaId],
    bankIds: [],
    ...(order ? { order } : {})
  }
}

function yearStudents(year: string, n: number, prefix: string): EngineStudent[] {
  return students(n, Number(year)).map((x) => ({ ...x, id: `${prefix}${x.id}`, yearLevel: year }))
}

describe('each line can have its own order (Year 7 low tiers, Year 12 keeps last year’s)', () => {
  const usual = { ...DEFAULT_PLAN, accessibleFirst: false }
  const tierOf = (id: string) => twoSides().find((l) => l.id === id)!.tier

  it('a plan saved by an earlier version, with no order on its lines, still reads', () => {
    const old = JSON.parse(
      JSON.stringify({
        ...DEFAULT_PLAN,
        rules: [{ id: 'r', label: 'All', yearLevels: [], groups: [], areaIds: [], bankIds: [] }]
      })
    ) as unknown
    const parsed = AllocationPlanSchema.parse(old)
    expect(parsed.rules[0]!.order).toBeUndefined()
    const own = { ...usualOrder(DEFAULT_PLAN), lockerOrder: 'column' as const }
    const withOrder = AllocationPlanSchema.parse({
      ...parsed,
      rules: [{ ...parsed.rules[0]!, order: own }]
    })
    expect(withOrder.rules[0]!.order).toEqual(own)
  })

  it('Year 7 fills middle and bottom first while Year 8 fills by number, in one run', () => {
    const plan: AllocationPlan = {
      ...usual,
      lockerOrder: 'number',
      rules: [
        line('y7', ['7'], 'a7', { ...usualOrder(usual), lockerOrder: 'tier_preference' }),
        line('y8', ['8'], 'a8')
      ]
    }
    const d = allocate(
      [...yearStudents('7', 12, 'p'), ...yearStudents('8', 12, 'q')],
      twoSides(),
      plan
    )
    expect(d.unplaced).toEqual([])
    const y7 = d.assignments.filter((a) => a.studentId.startsWith('p')).map((a) => a.lockerId)
    const y8 = d.assignments.filter((a) => a.studentId.startsWith('q')).map((a) => a.lockerId)
    expect(y7.map(tierOf).filter((t) => t === 'middle')).toHaveLength(10)
    expect(y7.map(tierOf).every((t) => t !== 'top')).toBe(true)
    expect([...y8].sort()).toEqual(Array.from({ length: 12 }, (_, i) => `ml${i}`).sort())
  })

  it('Year 12 keeps last year’s lockers while Year 11 is filled fresh', () => {
    const y11 = yearStudents('11', 5, 'p').map((x, i) => ({ ...x, lastYearLockerId: `l${29 - i}` }))
    const y12 = yearStudents('12', 5, 'q').map((x, i) => ({
      ...x,
      lastYearLockerId: `ml${29 - i}`
    }))
    const plan: AllocationPlan = {
      ...usual,
      rules: [
        line('y11', ['11'], 'a7'),
        line('y12', ['12'], 'a8', { ...usualOrder(usual), studentOrder: 'keep_last_year' })
      ]
    }
    const d = allocate([...y11, ...y12], twoSides(), plan)
    const got = new Map(d.assignments.map((a) => [a.studentId, a.lockerId]))
    for (const s of y12) expect(got.get(s.id)).toBe(s.lastYearLockerId)
    for (const s of y11) expect(got.get(s.id)).not.toBe(s.lastYearLockerId)
  })

  it('a line whose own order matches the usual order gives exactly the same draft', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('group_then_name', 'name', 'house_then_name', 'random', 'keep_last_year'),
        fc.constantFrom('number', 'bank_then_number', 'column', 'tier_preference'),
        fc.integer({ min: 0, max: 3 }),
        fc.integer({ min: 0, max: 3 }),
        (so, lo, gapG, gapB) => {
          const p: AllocationPlan = {
            ...DEFAULT_PLAN,
            seed: 'same',
            studentOrder: so as AllocationPlan['studentOrder'],
            lockerOrder: lo as AllocationPlan['lockerOrder'],
            gapAfterGroup: gapG,
            gapAfterBank: gapB,
            rules: [line('y7', ['7'], 'a7'), line('y8', ['8'], 'a8')]
          }
          const withOwn = { ...p, rules: p.rules.map((r) => ({ ...r, order: usualOrder(p) })) }
          const people = [...yearStudents('7', 25, 'p'), ...yearStudents('8', 25, 'q')]
          expect(allocate(people, twoSides(), withOwn)).toEqual(allocate(people, twoSides(), p))
        }
      ),
      { numRuns: 100 }
    )
  })

  it('with a different order on every line, nobody is placed twice and everyone stays on their side', () => {
    const order = fc.record({
      studentOrder: fc.constantFrom(
        'group_then_name',
        'name',
        'house_then_name',
        'random',
        'keep_last_year'
      ),
      lockerOrder: fc.constantFrom('number', 'bank_then_number', 'column', 'tier_preference'),
      gapAfterGroup: fc.integer({ min: 0, max: 3 }),
      gapAfterBank: fc.integer({ min: 0, max: 3 })
    })
    fc.assert(
      fc.property(
        fc.option(order, { nil: undefined }),
        fc.option(order, { nil: undefined }),
        fc.integer({ min: 0, max: 40 }),
        fc.integer({ min: 0, max: 40 }),
        (o7, o8, n7, n8) => {
          const plan: AllocationPlan = {
            ...DEFAULT_PLAN,
            seed: 'lines',
            rules: [line('y7', ['7'], 'a7', o7), line('y8', ['8'], 'a8', o8)]
          }
          const people = [
            ...yearStudents('7', n7, 'p').map((x, i) => ({ ...x, lastYearLockerId: `l${i}` })),
            ...yearStudents('8', n8, 'q')
          ]
          const d = allocate(people, twoSides(), plan)
          expect(new Set(d.assignments.map((a) => a.lockerId)).size).toBe(d.assignments.length)
          expect(new Set(d.assignments.map((a) => a.studentId)).size).toBe(d.assignments.length)
          expect(d.assignments.length + d.unplaced.length).toBe(n7 + n8)
          for (const a of d.assignments)
            expect(a.lockerId.startsWith('m')).toBe(a.studentId.startsWith('q'))
        }
      ),
      { numRuns: 150 }
    )
  })
})

describe('committing, codes and the manual tools (SPEC.md 4.4, 4.5)', () => {
  async function allocated() {
    const db = await demo()
    const ctx = testContext()
    generateYearSet(db, ctx, { name: 'SYNTHETIC 2026', schoolYearId: null, seed: 'golden' })
    const { draft } = draftAllocation(db, savedPlan(db))
    const r = commitDraft(db, ctx, draft.assignments, { issueCodes: true })
    return { db, ctx, r }
  }

  it('a student moved from Year 7 to Year 8 no longer fits their Year 7 side locker, and gets a Year 8 suggestion', async () => {
    const { db, ctx } = await allocated()
    const a = db.get<{ student_id: string }>(
      "SELECT a.student_id FROM assignment a JOIN student s ON s.id = a.student_id WHERE a.status = 'current' AND s.year_level = '7' LIMIT 1"
    )!
    expect(lockerFitsPlan(db, a.student_id).fits).toBe(true)
    updateStudent(db, ctx, a.student_id, { yearLevel: '8', groupCode: '08A' })
    const r = lockerFitsPlan(db, a.student_id)
    expect(r.fits).toBe(false)
    expect(Number(r.suggestion!.number)).toBeGreaterThan(114)
  })

  it('commits the draft and issues a unique, valid code to every lock', async () => {
    const { db, r } = await allocated()
    expect(r.assigned).toBeGreaterThan(200)
    expect(r.codes).toBe(r.assigned)
    const key = codeKey(db)
    const codes = db.all<{ code_cipher: Uint8Array; code_status: string }>(
      'SELECT k.code_cipher, k.code_status FROM lock k WHERE k.code_cipher IS NOT NULL'
    )
    const plain = codes.map((c) => decryptCode(key, c.code_cipher))
    expect(new Set(plain).size).toBe(plain.length)
    expect(codes.every((c) => c.code_status === 'set')).toBe(true)
    expect(() =>
      commitDraft(
        db,
        testContext(),
        draftAllocation(db, savedPlan(db)).draft.assignments.slice(0, 0),
        { issueCodes: true }
      )
    ).not.toThrow()
  })

  it('a student who leaves frees the locker and puts its lock on the reset list', async () => {
    const { db, ctx } = await allocated()
    const s = db.get<{ student_id: string; locker_id: string }>(
      "SELECT student_id, locker_id FROM assignment WHERE status = 'current' LIMIT 1"
    )!
    releaseStudent(db, ctx, s.student_id, { left: true })
    expect(
      db.get<{ active: number }>('SELECT active FROM student WHERE id = $id', { $id: s.student_id })
        ?.active
    ).toBe(0)
    const tasks = resetTasks(db)
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({ lockerId: s.locker_id, status: 'needs_new_code' })
    // Staff reset it to 0 0 0 0: off the list, ready for a new code.
    markResetDone(db, ctx, tasks[0]!.lockId)
    expect(resetTasks(db)).toEqual([])
  })

  it('marks many locks as reset in one change', async () => {
    const { db, ctx } = await allocated()
    const held = db.all<{ student_id: string }>(
      "SELECT student_id FROM assignment WHERE status = 'current' LIMIT 3"
    )
    for (const h of held) releaseStudent(db, ctx, h.student_id, { left: true })
    const ids = resetTasks(db).map((t) => t.lockId)
    expect(markResetDoneMany(db, ctx, ids)).toBe(3)
    expect(resetTasks(db)).toEqual([])
  })

  it('a new student gets the first spare in their area and a code', async () => {
    const { db, ctx } = await allocated()
    const y7 = db.get<{ id: string }>(
      "SELECT id FROM student WHERE year_level = '7' AND group_code = 'ZZZ' LIMIT 1"
    )!
    db.run("UPDATE student SET group_code = '07A' WHERE id = $id", { $id: y7.id }) // moved into a homeroom
    const suggestion = suggestLocker(db, y7.id)!
    expect(Number(suggestion.number)).toBeLessThanOrEqual(114)
    const { code } = assignStudent(db, ctx, y7.id, suggestion.lockerId)
    expect(code).toMatch(/^\d{4}$/)
    expect(() => assignStudent(db, ctx, y7.id, suggestion.lockerId)).toThrow(/already has a locker/)
  })

  it('a new student’s suggestion follows their line’s own locker order', async () => {
    const db = await demo()
    const ctx = testContext()
    const y7 = db.get<{ id: string }>(
      "SELECT id FROM student WHERE year_level = '7' AND group_code <> 'ZZZ' LIMIT 1"
    )!
    const tierOf = (id: string) =>
      db.get<{ tier: string }>('SELECT tier FROM locker WHERE id = $id', { $id: id })?.tier
    expect(tierOf(suggestLocker(db, y7.id)!.lockerId)).toBe('top')
    const plan = savedPlan(db)
    savePlan(db, ctx, {
      ...plan,
      rules: plan.rules.map((r) =>
        r.yearLevels.includes('7')
          ? { ...r, order: { ...usualOrder(plan), lockerOrder: 'tier_preference' as const } }
          : r
      )
    })
    expect(tierOf(suggestLocker(db, y7.id)!.lockerId)).toBe('middle')
  })

  it('a move flags the old lock and gives the new one a code', async () => {
    const { db, ctx } = await allocated()
    const a = db.get<{ student_id: string; locker_id: string }>(
      "SELECT student_id, locker_id FROM assignment WHERE status = 'current' LIMIT 1"
    )!
    const spare = suggestLocker(db, a.student_id)!
    const r = moveStudent(db, ctx, a.student_id, spare.lockerId)
    expect(r.from).toBe(a.locker_id)
    expect(resetTasks(db).map((t) => t.lockerId)).toEqual([a.locker_id])
  })

  it('a swap moves whole records and changes both codes (SPEC.md section 15, item 2)', async () => {
    const { db, ctx } = await allocated()
    const [a, b] = db.all<{ student_id: string; locker_id: string }>(
      "SELECT student_id, locker_id FROM assignment WHERE status = 'current' LIMIT 2"
    )
    const key = codeKey(db)
    const codeOf = (lockerId: string) =>
      decryptCode(
        key,
        db.get<{ code_cipher: Uint8Array }>('SELECT code_cipher FROM lock WHERE locker_id = $l', {
          $l: lockerId
        })!.code_cipher
      )
    const before = [codeOf(a!.locker_id), codeOf(b!.locker_id)]
    swapStudents(db, ctx, a!.student_id, b!.student_id)
    const now = (id: string) =>
      db.get<{ locker_id: string }>(
        "SELECT locker_id FROM assignment WHERE student_id = $s AND status = 'current'",
        { $s: id }
      )!.locker_id
    expect(now(a!.student_id)).toBe(b!.locker_id)
    expect(now(b!.student_id)).toBe(a!.locker_id)
    expect(codeOf(a!.locker_id)).not.toBe(before[0])
    expect(codeOf(b!.locker_id)).not.toBe(before[1])
    expect(resetTasks(db).map((t) => t.status)).toEqual([
      'awaiting_physical_reset',
      'awaiting_physical_reset'
    ])
  })

  it('a compromised code gets a new one and waits for the physical reset; showing a code is logged', async () => {
    const { db, ctx } = await allocated()
    const a = db.get<{ locker_id: string }>(
      "SELECT locker_id FROM assignment WHERE status = 'current' LIMIT 1"
    )!
    const lock = db.get<{ id: string }>('SELECT id FROM lock WHERE locker_id = $l', {
      $l: a.locker_id
    })!
    const old = revealCode(db, ctx, a.locker_id, 'screen')
    const fresh = issueCode(db, ctx, lock.id, 'compromised')
    expect(fresh).not.toBe(old)
    expect(resetTasks(db)[0]?.status).toBe('awaiting_physical_reset')
    expect(db.all('SELECT * FROM code_reveal_log')).toHaveLength(1)
  })

  it('next year’s set never gives a locker the same code again', async () => {
    const { db, ctx } = await allocated()
    const key = codeKey(db)
    const now = new Map(
      db
        .all<{ locker_id: string; code_cipher: Uint8Array }>(
          'SELECT locker_id, code_cipher FROM lock WHERE code_cipher IS NOT NULL'
        )
        .map((r) => [r.locker_id, decryptCode(key, r.code_cipher)])
    )
    const r = generateYearSet(db, ctx, { name: 'SYNTHETIC 2027', schoolYearId: null, seed: 'next' })
    expect(r.overHalf).toBe(false)
    const set = db.all<{ locker_id: string; code_cipher: Uint8Array }>(
      "SELECT e.locker_id, e.code_cipher FROM code_set_entry e JOIN code_set s ON s.id = e.code_set_id WHERE s.name = 'SYNTHETIC 2027'"
    )
    for (const e of set) expect(decryptCode(key, e.code_cipher)).not.toBe(now.get(e.locker_id))
  })
})
