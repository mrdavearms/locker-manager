import { describe, expect, it } from 'vitest'
import { createDemoDatabase, generateDemoSchool } from '../../src/main/demo/demoSchool'
import { summarise } from '../../src/main/db/summary'
import { testContext } from './helpers'

describe('the demo school', () => {
  it('is the same every time for the same seed', () => {
    expect(generateDemoSchool(7)).toEqual(generateDemoSchool(7))
    expect(generateDemoSchool(7)).not.toEqual(generateDemoSchool(8))
  })

  it('is shaped like the WHS case (SPEC.md section 12)', () => {
    const s = generateDemoSchool()
    expect(s.areas.map((a) => [a.first, a.last])).toEqual([
      [1, 114],
      [115, 228]
    ])
    for (const year of ['Year 7', 'Year 8']) {
      const groups = new Set(s.students.filter((x) => x.yearLevel === year).map((x) => x.groupCode))
      const y = year.slice(-1)
      expect([...groups].sort()).toEqual([
        `0${y}A`,
        `0${y}B`,
        `0${y}C`,
        `0${y}D`,
        `0${y}E`,
        'HUB',
        'ZZZ'
      ])
      const eligible = s.students.filter((x) => x.yearLevel === year && x.groupCode !== 'ZZZ')
      expect(eligible.length).toBeLessThanOrEqual(114)
      expect(eligible.length).toBeGreaterThan(100)
    }
    expect(s.excludedGroups).toEqual(['ZZZ'])
  })

  it('has unique synthetic IDs and the awkward surnames that need checking', () => {
    const s = generateDemoSchool()
    const ids = s.students.map((x) => x.externalId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every((id) => id.startsWith('SYN'))).toBe(true)
    expect(s.students.every((x) => x.lastNameRaw === x.lastName.toUpperCase())).toBe(true)
  })

  it('builds a complete demo data file marked DEMO', async () => {
    const db = await createDemoDatabase(testContext(), '0.1.0')
    const sum = summarise(db)
    expect(sum.demo).toBe(true)
    expect(sum.counts.lockers).toBe(228)
    expect(sum.counts.locks).toBe(228)
    expect(sum.counts.students).toBe(generateDemoSchool().students.length)
    expect(db.integrityProblems()).toEqual([])
    expect(db.foreignKeyProblems()).toBe(0)
    expect(db.all("SELECT 1 FROM lock WHERE code_status <> 'reset_no_code'")).toHaveLength(0)
  })
})
