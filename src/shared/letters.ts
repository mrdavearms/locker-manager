import { z } from 'zod'

// Letters to students (SPEC.md 4.8 and 5.2). A letter is a list of sections. Each
// section shows for every lock, or only for some kinds of lock, and holds its words
// in every language the school uses. One student per page, always.

export const LANGUAGE_CODE = z
  .string()
  .regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/, 'Use a short language code, for example vi or zh-Hans')

export const LanguageSchema = z.object({
  code: LANGUAGE_CODE,
  name: z.string().trim().min(1).max(40)
})
export type Language = z.infer<typeof LanguageSchema>

/** Words in each language, by language code. A missing language falls back to the first. */
export const LocalisedSchema = z.record(z.string().max(20), z.string().max(4000))
export type Localised = z.infer<typeof LocalisedSchema>

/** Which locks a section is for (SPEC.md 5.2: per lock type sections). */
export const SHOW_FOR = ['all', 'code', 'settable', 'fixed', 'keyed', 'no_lock'] as const
export type ShowFor = (typeof SHOW_FOR)[number]
export const SHOW_FOR_TEXT: Record<ShowFor, string> = {
  all: 'Every student',
  code: 'Locks with a code',
  settable: 'Locks whose code can be set',
  fixed: 'Padlocks with a fixed code',
  keyed: 'Locks with a key',
  no_lock: 'No lock'
}

export const BLOCK_TYPES = ['header', 'stripe', 'student', 'text', 'image', 'space'] as const
export type BlockType = (typeof BLOCK_TYPES)[number]
export const BLOCK_TEXT: Record<BlockType, string> = {
  header: 'Heading band',
  stripe: 'Colour stripe',
  student: 'Name, locker and code',
  text: 'Words',
  image: 'Picture',
  space: 'Space'
}

export const TONES = ['plain', 'panel', 'help'] as const
export type Tone = (typeof TONES)[number]
export const TONE_TEXT: Record<Tone, string> = {
  plain: 'Plain',
  panel: 'Shaded panel',
  help: 'Help box'
}

export const LetterBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(BLOCK_TYPES),
  show: z.enum(SHOW_FOR),
  heading: LocalisedSchema,
  body: LocalisedSchema,
  tone: z.enum(TONES),
  /** A picture the school uploaded, for 'image' blocks or beside 'text'. */
  imageId: z.string().max(64).nullable(),
  imageSide: z.enum(['left', 'right']),
  /** Picture width, or space height, in millimetres. */
  size: z.number().min(2).max(180)
})
export type LetterBlock = z.infer<typeof LetterBlockSchema>

export const LetterTemplateSchema = z.object({
  pageSize: z.enum(['A4', 'Letter']),
  languages: z.array(LanguageSchema).min(1).max(10),
  blocks: z.array(LetterBlockSchema).max(40),
  usePreferredName: z.boolean(),
  colour: z.enum(['colour', 'mono'])
})
export type LetterTemplate = z.infer<typeof LetterTemplateSchema>

/** Merge fields a school can type into its words, in braces: {locker}. */
export const MERGE_FIELDS = [
  ['first_name', 'First name (or preferred name)'],
  ['last_name', 'Last name'],
  ['full_name', 'Full name'],
  ['group', 'Group (Homeroom)'],
  ['year_level', 'Year level'],
  ['locker', 'Locker number'],
  ['bank', 'Bank'],
  ['area', 'Area'],
  ['code', 'Lock code'],
  ['lock_type', 'Kind of lock'],
  ['key_number', 'Key number'],
  ['school', 'School name'],
  ['leader', 'Year Level Leader (the word your school uses)'],
  ['office', 'Office (the word your school uses)'],
  ['date', 'Today’s date'],
  ['year', 'This year']
] as const
export type MergeField = (typeof MERGE_FIELDS)[number][0]

export const LetterSelectionSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('all') }),
  z.object({ mode: z.literal('group'), group: z.string().min(1).max(40) }),
  z.object({ mode: z.literal('bank'), bankId: z.string().min(1).max(64) }),
  z.object({ mode: z.literal('lockers'), numbers: z.string().min(1).max(2000) }),
  z.object({ mode: z.literal('changed') }),
  z.object({ mode: z.literal('student'), studentId: z.string().min(1).max(64) })
])
export type LetterSelection = z.infer<typeof LetterSelectionSchema>

/** Language for a print job: one language for everyone, or each student's own. */
export const LetterLanguageSchema = z.union([
  z.object({ kind: z.literal('one'), code: LANGUAGE_CODE }),
  z.object({ kind: z.literal('each') })
])
export type LetterLanguage = z.infer<typeof LetterLanguageSchema>

export interface LetterRecord {
  studentId: string
  lockerId: string
  firstName: string
  lastName: string
  group: string | null
  yearLevel: string | null
  locker: string
  bank: string
  area: string
  lockType: string
  /** What the lock needs, which decides the sections shown. */
  kind: 'settable' | 'fixed' | 'keyed' | 'no_lock'
  keyNumber: string | null
  language: string | null
}

export interface HeldBack {
  name: string
  locker: string
  reason: string
}

export interface LetterPreview {
  /** The letter shown, with codes hidden. */
  html: string
  index: number
  letters: number
  heldBack: HeldBack[]
  pageWidth: number
  pageHeight: number
  /** Letters whose name had to be printed at the smallest size. */
  tooLong: string[]
}

export interface ImageView {
  id: string
  name: string
  mime: string
  dataUrl: string
  bytes: number
  width: number
  height: number
}

export const LETTER_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml'] as const
export const MAX_LETTER_IMAGE_BYTES = 3 * 1024 * 1024

export const PAGE_SIZES = {
  A4: { width: 210, height: 297 },
  Letter: { width: 215.9, height: 279.4 }
} as const
