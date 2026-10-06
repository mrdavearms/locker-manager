import { LockerDb } from '../db/db'
import { appendAudit, newId, stamp, type OperatorContext } from '../db/context'
import { createNewDatabase } from '../db/newFile'

// A synthetic school shaped like the real WHS case (SPEC.md section 12), used for
// "Try the demo school" and as the fixture for the golden allocation test in M4:
//   two year levels; Homerooms A to E plus a group sorted last (HUB) and an
//   excluded group (ZZZ); 228 lockers split 114 / 114 in two areas.
// Every name is invented. Deterministic: the same seed gives the same school.

export interface DemoStudent {
  externalId: string
  firstNameRaw: string
  lastNameRaw: string
  firstName: string
  lastName: string
  yearLevel: string
  groupCode: string
}

export interface DemoSchool {
  schoolName: string
  areas: { name: string; yearLevel: string; first: number; last: number; columns: number }[]
  students: DemoStudent[]
  excludedGroups: string[]
}

/** Small, fast, seedable random numbers (mulberry32). Not for codes. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const FIRST = [
  'Ava',
  'Noah',
  'Mia',
  'Leo',
  'Isla',
  'Oliver',
  'Grace',
  'Jack',
  'Chloe',
  'Harrison',
  'Ruby',
  'Lachlan',
  'Zara',
  'Archer',
  'Matilda',
  'Hamish',
  'Ella',
  'Kai',
  'Sienna',
  'Ethan',
  'Amelia',
  'Jaxon',
  'Willow',
  'Cooper',
  'Harper',
  'Riley',
  'Evie',
  'Arlo',
  'Layla',
  'Hudson',
  'Ivy',
  'Felix',
  'Aisha',
  'Tane',
  'Priya',
  'Mohammed',
  'Mei',
  'Arjun',
  'Sofia',
  'Luca',
  'Anika',
  'Darcy',
  'Indi',
  'Banjo',
  'Tilly',
  'Rafael',
  'Xavier-James',
  'Anastasia-Rose'
]

// Surnames include the shapes that need care (SPEC.md section 15, items 4 and 8):
// Mc, O', hyphens, particles, Mac (ambiguous), two-word, and very long names.
const LAST = [
  'Nguyen',
  'Smith',
  'Williams',
  'Brown',
  'Jones',
  'Kelly',
  'Taylor',
  'Wilson',
  'Martin',
  'Anderson',
  'Thompson',
  'White',
  'Walker',
  'Harris',
  'Ryan',
  'Lee',
  'Clarke',
  'Robinson',
  'Young',
  'King',
  'McNair',
  'McPhee',
  "O'Brien",
  "O'Sullivan",
  'Smith-Jones',
  'Barker-Hall',
  'van Bergen',
  'De La Rue',
  'MacDonald',
  'Mackay',
  'Da Silva',
  'di Stefano',
  'Le Roux',
  'Papadopoulos',
  'Kowalczyk',
  'Ramaswamy',
  'Wickramasinghe Arachchige',
  'Fitzgerald-Montgomery',
  'Tran',
  'Chen',
  'Singh',
  'Patel',
  'Ahmed',
  'Haddad',
  'Moretti',
  'Okafor',
  'Takahashi',
  'Rossi'
]

function pick<T>(rand: () => number, list: readonly T[]): T {
  return list[Math.floor(rand() * list.length)] as T
}

/** The same school every time for the same seed. Pure. */
export function generateDemoSchool(seed = 2026): DemoSchool {
  const rand = seededRandom(seed)
  const students: DemoStudent[] = []
  let serial = 1
  const usedNames = new Set<string>()
  const add = (yearLevel: string, groupCode: string): void => {
    let first = pick(rand, FIRST)
    let last = pick(rand, LAST)
    for (let tries = 0; usedNames.has(`${first} ${last}`) && tries < 20; tries++) {
      first = pick(rand, FIRST)
      last = pick(rand, LAST)
    }
    usedNames.add(`${first} ${last}`)
    students.push({
      externalId: `SYN${String(serial++).padStart(4, '0')}`,
      firstNameRaw: first,
      // Student systems export surnames in capitals.
      lastNameRaw: last.toUpperCase(),
      firstName: first,
      lastName: last,
      yearLevel,
      groupCode
    })
  }
  for (const year of ['7', '8']) {
    for (const g of ['A', 'B', 'C', 'D', 'E']) {
      const size = 20 + Math.floor(rand() * 3) // 20 to 22
      for (let i = 0; i < size; i++) add(`Year ${year}`, `0${year}${g}`)
    }
    for (let i = 0; i < 4; i++) add(`Year ${year}`, 'HUB')
    for (let i = 0; i < 3; i++) add(`Year ${year}`, 'ZZZ')
  }
  return {
    schoolName: 'Demo Secondary College',
    areas: [
      { name: 'Year 7 side', yearLevel: 'Year 7', first: 1, last: 114, columns: 38 },
      { name: 'Year 8 side', yearLevel: 'Year 8', first: 115, last: 228, columns: 38 }
    ],
    students,
    excludedGroups: ['ZZZ']
  }
}

/** Builds a whole demo data file in memory, marked DEMO. */
export async function createDemoDatabase(
  ctx: OperatorContext,
  appVersion: string,
  seed = 2026
): Promise<LockerDb> {
  const school = generateDemoSchool(seed)
  const db = await createNewDatabase(ctx, { schoolName: school.schoolName, appVersion, demo: true })
  const s = stamp(ctx)
  const ts = { $c: s.created_at, $by: s.updated_by }
  db.transaction(() => {
    school.areas.forEach((area, ai) => {
      const areaId = newId()
      db.run(
        `INSERT INTO area (id, name, sort_order, default_year_levels, created_at, updated_at, updated_by)
         VALUES ($id, $name, $o, $yl, $c, $c, $by)`,
        { $id: areaId, $name: area.name, $o: ai, $yl: JSON.stringify([area.yearLevel]), ...ts }
      )
      const bankId = newId()
      db.run(
        `INSERT INTO bank (id, area_id, name, sort_order, layout_rows, layout_columns, created_at, updated_at, updated_by)
         VALUES ($id, $a, $name, 0, 3, $cols, $c, $c, $by)`,
        { $id: bankId, $a: areaId, $name: `${area.name} bank`, $cols: area.columns, ...ts }
      )
      const tiers = ['top', 'middle', 'bottom'] as const
      for (let n = area.first; n <= area.last; n++) {
        const idx = n - area.first
        const column = Math.floor(idx / 3) + 1
        const tier = tiers[idx % 3] ?? 'top'
        const lockerId = newId()
        db.run(
          `INSERT INTO locker (id, number, sort_key, bank_id, position_row, position_column, tier, accessible, qr_id,
                               created_at, updated_at, updated_by)
           VALUES ($id, $n, $k, $b, $r, $col, $tier, $acc, $qr, $c, $c, $by)`,
          {
            $id: lockerId,
            $n: String(n),
            $k: String(n).padStart(6, '0'),
            $b: bankId,
            $r: (idx % 3) + 1,
            $col: column,
            $tier: tier,
            // A few low lockers at the end of each bank are accessible.
            $acc: tier === 'bottom' && idx >= area.last - area.first - 5 ? 1 : 0,
            $qr: newId(),
            ...ts
          }
        )
        db.run(
          `INSERT INTO lock (id, type, manufacturer, model, dials, positions_per_dial, locker_id, code_status,
                             created_at, updated_at, updated_by)
           VALUES ($id, 'combination_builtin', 'Demo', 'Four-dial built-in', 4, 10, $l, 'reset_no_code', $c, $c, $by)`,
          { $id: newId(), $l: lockerId, ...ts }
        )
      }
    })
    for (const st of school.students) {
      db.run(
        `INSERT INTO student (id, external_id, first_name_raw, last_name_raw, first_name, last_name, year_level, group_code,
                              first_seen, last_seen, created_at, updated_at, updated_by)
         VALUES ($id, $e, $fr, $lr, $f, $l, $y, $g, $c, $c, $c, $c, $by)`,
        {
          $id: newId(),
          $e: st.externalId,
          $fr: st.firstNameRaw,
          $lr: st.lastNameRaw,
          $f: st.firstName,
          $l: st.lastName,
          $y: st.yearLevel,
          $g: st.groupCode,
          ...ts
        }
      )
    }
    for (const g of school.excludedGroups) {
      db.run(
        `INSERT INTO exclusion (id, kind, value, reason, created_at, updated_at, updated_by)
         VALUES ($id, 'group', $v, 'Not in a homeroom', $c, $c, $by)`,
        { $id: newId(), $v: g, ...ts }
      )
    }
    appendAudit(db, ctx, {
      action: 'demo.generated',
      entity: 'school',
      after: { seed, students: school.students.length, lockers: 228 }
    })
  })
  return db
}
