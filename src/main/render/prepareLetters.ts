import {
  PAGE_SIZES,
  type HeldBack,
  type LetterLanguage,
  type LetterSelection,
  type LetterTemplate
} from '@shared/letters'
import type { LockerDb } from '../db/db'
import {
  letterImages,
  letterItems,
  letterSchool,
  letterSet,
  letterTemplate
} from '../repos/letters'
import { getTerms } from '../repos/school'
import { buildLetters, type LetterItem } from './letter'

export interface PreparedLetters {
  html: string
  items: LetterItem[]
  heldBack: HeldBack[]
  tooLong: string[]
  page: { width: number; height: number }
}

type PrepareOptions = {
  selection: LetterSelection
  language: LetterLanguage
  template?: LetterTemplate | undefined
  masked: boolean
  preview: boolean
  index?: number
}

function prepareParts(db: LockerDb, opts: PrepareOptions) {
  const template = opts.template ?? letterTemplate(db)
  const set = letterSet(db, opts.selection, template.usePreferredName)
  const items = letterItems(set, template, opts.language, opts.masked)
  const input = {
    template,
    terms: getTerms(db),
    school: letterSchool(db, template),
    images: letterImages(db),
    today: new Date(),
    preview: opts.preview
  }
  return { template, set, items, input }
}

/**
 * Everything needed to show, save or print letters, from the open file. `index`
 * builds only that one letter (the on-screen preview); codes are masked unless
 * `masked` is false.
 */
export function prepareLetters(db: LockerDb, opts: PrepareOptions): PreparedLetters {
  const { template, set, items, input } = prepareParts(db, opts)
  const shown =
    opts.index === undefined
      ? items
      : items.slice(
          Math.min(opts.index, items.length - 1),
          Math.min(opts.index, items.length - 1) + 1
        )
  const out = buildLetters(input, shown)
  return {
    html: out.html,
    items,
    heldBack: set.heldBack,
    tooLong: out.tooLong,
    page: PAGE_SIZES[template.pageSize]
  }
}

/**
 * The same letters as `prepareLetters`, plus the letters split into whole pages
 * of up to `size` letters each, so they can be checked and made a chunk at a time
 * with progress shown and Cancel honoured between chunks.
 */
export function prepareLetterChunks(
  db: LockerDb,
  opts: Omit<PrepareOptions, 'index'>,
  size = 25
): { chunks: string[]; prepared: PreparedLetters } {
  const { template, set, items, input } = prepareParts(db, opts)
  const whole = buildLetters(input, items)
  const chunks: string[] = []
  for (let i = 0; i < items.length; i += size)
    chunks.push(buildLetters(input, items.slice(i, i + size)).html)
  return {
    chunks,
    prepared: {
      html: whole.html,
      items,
      heldBack: set.heldBack,
      tooLong: whole.tooLong,
      page: PAGE_SIZES[template.pageSize]
    }
  }
}
