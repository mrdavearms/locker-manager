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

/**
 * Everything needed to show, save or print letters, from the open file. `index`
 * builds only that one letter (the on-screen preview); codes are masked unless
 * `masked` is false.
 */
export function prepareLetters(
  db: LockerDb,
  opts: {
    selection: LetterSelection
    language: LetterLanguage
    template?: LetterTemplate | undefined
    masked: boolean
    preview: boolean
    index?: number
  }
): PreparedLetters {
  const template = opts.template ?? letterTemplate(db)
  const set = letterSet(db, opts.selection, template.usePreferredName)
  const items = letterItems(set, template, opts.language, opts.masked)
  const shown =
    opts.index === undefined
      ? items
      : items.slice(
          Math.min(opts.index, items.length - 1),
          Math.min(opts.index, items.length - 1) + 1
        )
  const out = buildLetters(
    {
      template,
      terms: getTerms(db),
      school: letterSchool(db, template),
      images: letterImages(db),
      today: new Date(),
      preview: opts.preview
    },
    shown
  )
  return {
    html: out.html,
    items,
    heldBack: set.heldBack,
    tooLong: out.tooLong,
    page: PAGE_SIZES[template.pageSize]
  }
}
