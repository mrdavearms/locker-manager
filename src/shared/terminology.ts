import { z } from 'zod'

// Every noun a school might call something different (SPEC.md 3.9). The UI,
// labels, letters and reports all take their words from here.

export const TERM_KEYS = [
  'locker',
  'bank',
  'area',
  'group',
  'yearLevel',
  'house',
  'studentId',
  'yearLevelLeader',
  'office'
] as const
export type TermKey = (typeof TERM_KEYS)[number]

const Term = z.object({
  one: z.string().trim().min(1).max(40),
  many: z.string().trim().min(1).max(40)
})
export type Term = z.infer<typeof Term>
export const TerminologySchema = z.object(
  Object.fromEntries(TERM_KEYS.map((k) => [k, Term])) as Record<TermKey, typeof Term>
)
export type Terminology = z.infer<typeof TerminologySchema>

const t = (one: string, many = `${one}s`): Term => ({ one, many })

export interface TerminologyPreset {
  id: string
  name: string
  description: string
  terms: Terminology
}

/** The defaults reproduce the working set-up the app was designed from (SPEC.md principle 6). */
export const DEFAULT_TERMS: Terminology = {
  locker: t('Locker'),
  bank: t('Bank'),
  area: t('Area'),
  group: t('Homeroom'),
  yearLevel: t('Year level'),
  house: t('House'),
  studentId: t('Student ID'),
  yearLevelLeader: t('Year Level Leader'),
  office: t('General Office', 'General Office')
}

export const TERMINOLOGY_PRESETS: readonly TerminologyPreset[] = [
  {
    id: 'vic-government',
    name: 'Victorian government school',
    description: 'Homeroom, Year Level Leader, General Office',
    terms: DEFAULT_TERMS
  },
  {
    id: 'nsw',
    name: 'New South Wales',
    description: 'Roll class, Year Adviser, Front Office',
    terms: {
      ...DEFAULT_TERMS,
      group: t('Roll class', 'Roll classes'),
      yearLevel: t('Year'),
      studentId: t('Student number'),
      yearLevelLeader: t('Year Adviser'),
      office: t('Front Office', 'Front Office')
    }
  },
  {
    id: 'queensland',
    name: 'Queensland',
    description: 'Form class, Year Coordinator, Administration',
    terms: {
      ...DEFAULT_TERMS,
      group: t('Form class', 'Form classes'),
      studentId: t('EQ ID', 'EQ IDs'),
      yearLevelLeader: t('Year Coordinator'),
      office: t('Administration', 'Administration')
    }
  },
  {
    id: 'independent',
    name: 'Independent school',
    description: 'Tutor group, Head of Year, Reception',
    terms: {
      ...DEFAULT_TERMS,
      group: t('Tutor group'),
      yearLevel: t('Year'),
      yearLevelLeader: t('Head of Year', 'Heads of Year'),
      office: t('Reception', 'Reception')
    }
  },
  {
    id: 'international',
    name: 'International school',
    description: 'Homeroom, Grade, Grade Level Leader',
    terms: {
      ...DEFAULT_TERMS,
      yearLevel: t('Grade'),
      yearLevelLeader: t('Grade Level Leader'),
      office: t('Front Office', 'Front Office')
    }
  }
]

/** Fills anything missing from a stored map with the default. */
export function resolveTerms(stored: unknown): Terminology {
  const base: Record<string, Term> = { ...DEFAULT_TERMS }
  if (stored && typeof stored === 'object') {
    for (const k of TERM_KEYS) {
      const parsed = Term.safeParse((stored as Record<string, unknown>)[k])
      if (parsed.success) base[k] = parsed.data
    }
  }
  return base as Terminology
}

export const TERM_LABELS: Record<TermKey, string> = {
  locker: 'A locker',
  bank: 'A row or wall of lockers',
  area: 'A group of banks, such as a wing',
  group: 'A class group (Homeroom, Form, Roll class…)',
  yearLevel: 'Year level',
  house: 'House',
  studentId: 'The student ID from your student system',
  yearLevelLeader: 'The person students go to for help',
  office: 'Where students go with a problem'
}
