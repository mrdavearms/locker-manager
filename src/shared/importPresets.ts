import type { ImportField } from './importTypes'

// Built-in column mappings (SPEC.md 4.2 step 3). Each lists the header names that
// export uses for each field. Detected by how many of a file's headers match.
// Compass's "Student Year Level Export" is confirmed from a real export; the others
// use their documented or commonly seen headers and can be adjusted on screen.

export interface ImportPreset {
  id: string
  name: string
  aliases: Partial<Record<ImportField, string[]>>
  /** Header names unique enough to identify the preset. */
  signature: string[]
}

export function norm(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '')
}

const GENERIC: ImportPreset['aliases'] = {
  externalId: [
    'studentid',
    'studentnumber',
    'studentcode',
    'id',
    'idnumber',
    'studentno',
    'code',
    'sussiid',
    'vsn',
    'casesid',
    'cases21id',
    'localstudentid'
  ],
  firstName: ['firstname', 'givenname', 'givennames', 'forename', 'legalfirstname', 'first'],
  lastName: ['lastname', 'surname', 'familyname', 'legalsurname', 'last'],
  preferredName: ['preferredname', 'preferredfirstname', 'knownas', 'nickname', 'preferred'],
  yearLevel: ['yearlevel', 'year', 'grade', 'yr', 'schoolyear', 'yearlevelcode', 'level'],
  group: [
    'formgroup',
    'homeroom',
    'rollclass',
    'form',
    'tutorgroup',
    'homegroup',
    'mentorgroup',
    'pastoralgroup',
    'class',
    'rollgroup',
    'carergroup'
  ],
  house: ['house', 'housegroup', 'faction'],
  gender: ['gender', 'sex'],
  email: ['email', 'emailaddress', 'studentemail', 'schoolemail']
}

export const PRESETS: readonly ImportPreset[] = [
  {
    id: 'compass',
    name: 'Compass (Student Year Level Export)',
    aliases: {
      externalId: ['sussiid'],
      firstName: ['firstname'],
      lastName: ['lastname'],
      preferredName: ['preferredname'],
      group: ['formgroup'],
      house: ['house'],
      gender: ['gender'],
      yearLevel: ['yearlevel']
    },
    signature: ['sussiid', 'importidentifier', 'formgroup', 'campus']
  },
  {
    id: 'sentral',
    name: 'Sentral',
    aliases: {
      externalId: ['studentid', 'externalid', 'studentnumber'],
      firstName: ['firstname', 'givenname'],
      lastName: ['surname', 'lastname'],
      preferredName: ['preferredname'],
      yearLevel: ['schoolyear', 'yearlevel'],
      group: ['rollclass', 'rollgroup'],
      house: ['house'],
      gender: ['gender']
    },
    signature: ['rollclass', 'schoolyear', 'externalid']
  },
  {
    id: 'simon',
    name: 'SIMON',
    aliases: {
      externalId: ['studentcode', 'id', 'studentid'],
      firstName: ['preferredname', 'firstname'],
      lastName: ['surname'],
      yearLevel: ['yearlevel', 'currentyearlevel'],
      group: ['homegroup', 'formclass'],
      house: ['house'],
      gender: ['gender']
    },
    signature: ['studentcode', 'homegroup']
  },
  {
    id: 'xuno',
    name: 'Xuno',
    aliases: {
      externalId: ['studentid', 'externalid', 'code'],
      firstName: ['firstname'],
      lastName: ['surname', 'lastname'],
      yearLevel: ['yearlevel'],
      group: ['homegroup', 'pastoralgroup'],
      house: ['house'],
      gender: ['gender']
    },
    signature: ['pastoralgroup']
  },
  {
    id: 'synergetic',
    name: 'Synergetic',
    aliases: {
      externalId: ['id', 'studentid', 'synergeticid'],
      firstName: ['given1', 'givenname', 'firstname'],
      lastName: ['surname'],
      preferredName: ['preferred', 'preferredname'],
      yearLevel: ['studentyearlevel', 'yearlevel'],
      group: ['studentform', 'form', 'tutorgroup'],
      house: ['studenthouse', 'house'],
      gender: ['gender']
    },
    signature: ['studentyearlevel', 'studentform', 'given1']
  },
  {
    id: 'tass',
    name: 'TASS',
    aliases: {
      externalId: ['studentcode', 'studentid', 'studcode'],
      firstName: ['givenname', 'firstname'],
      lastName: ['surname'],
      preferredName: ['preferredname'],
      yearLevel: ['yeargroup', 'yearlevel'],
      group: ['formclass', 'pastoralcarecode', 'pcgroup'],
      house: ['house'],
      gender: ['gender']
    },
    signature: ['studcode', 'yeargroup', 'pastoralcarecode']
  },
  {
    id: 'cases21',
    name: 'CASES21',
    aliases: {
      externalId: ['stkey', 'studentkey', 'casesid'],
      firstName: ['firstname', 'preferredname'],
      lastName: ['surname'],
      preferredName: ['preferredname'],
      yearLevel: ['schoolyear', 'yearlevel'],
      group: ['homegroup'],
      house: ['house'],
      gender: ['gender']
    },
    signature: ['stkey', 'homegroup']
  },
  { id: 'generic', name: 'Other (match columns by name)', aliases: GENERIC, signature: [] }
]

/** Picks the preset whose signature best matches these headers; generic if none does. */
export function detectPreset(headers: readonly string[]): ImportPreset {
  const set = new Set(headers.map(norm))
  let best: ImportPreset = PRESETS[PRESETS.length - 1]!
  let bestScore = 0
  for (const p of PRESETS) {
    const score = p.signature.filter((s) => set.has(s)).length
    if (score > bestScore) {
      best = p
      bestScore = score
    }
  }
  return best
}

/** Column index for each field: the preset's names first, then generic names. */
export function mapColumns(
  headers: readonly string[],
  preset: ImportPreset
): Partial<Record<ImportField, number>> {
  const normed = headers.map(norm)
  const out: Partial<Record<ImportField, number>> = {}
  const taken = new Set<number>()
  const fields = Object.keys(GENERIC) as ImportField[]
  for (const field of fields) {
    const candidates = [...(preset.aliases[field] ?? []), ...(GENERIC[field] ?? [])]
    for (const c of candidates) {
      const idx = normed.findIndex((h, i) => h === c && !taken.has(i))
      if (idx >= 0) {
        out[field] = idx
        taken.add(idx)
        break
      }
    }
  }
  return out
}

/** Every header name any preset knows, for finding the header row. */
export const KNOWN_HEADERS: ReadonlySet<string> = new Set(
  PRESETS.flatMap((p) => [...p.signature, ...Object.values(p.aliases).flatMap((a) => a ?? [])])
)
