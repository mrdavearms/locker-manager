import {
  LETTER_IMAGE_TYPES,
  LetterTemplateSchema,
  MAX_LETTER_IMAGE_BYTES,
  type HeldBack,
  type ImageView,
  type LetterLanguage,
  type LetterRecord,
  type LetterSelection,
  type LetterTemplate
} from '@shared/letters'
import { LOCK_TYPE_INFO, type LockType } from '@shared/locks'
import type { CodeStatus } from '@shared/codes'
import type { LockerDb } from '../db/db'
import { newId, stamp, type OperatorContext } from '../db/context'
import { decryptCode, readCodeKey } from '../codes/cipher'
import { displayGroup } from '../import/groups'
import { compareLockerNumbers } from '../locations/lockerNumbers'
import { defaultLetterTemplate } from '../letters/defaultTemplate'
import { imageDataUrl } from '../render/html'
import type { LetterImage, LetterItem, LetterSchool } from '../render/letter'
import { parseLockerList } from './labels'
import { getSchoolProfile, getTerms } from './school'
import { getSetting, setSetting } from './settings'
import { groupMap } from './students'

// Letters (SPEC.md 4.8 and 5.2): the template, the school's pictures, and which
// students get a letter. Spare lockers never get one. A letter whose lock still
// has to be reset, or that has no code yet, is held back with the reason.

const TEMPLATE_KEY = 'letters.template'

export function letterTemplate(db: LockerDb): LetterTemplate {
  return getSetting(
    db,
    TEMPLATE_KEY,
    LetterTemplateSchema,
    defaultLetterTemplate(getTerms(db).locker.one)
  )
}

export function saveLetterTemplate(
  db: LockerDb,
  ctx: OperatorContext,
  template: LetterTemplate
): LetterTemplate {
  const t = LetterTemplateSchema.parse(template)
  const codes = new Set<string>()
  for (const l of t.languages) {
    if (codes.has(l.code)) throw new Error(`The language code "${l.code}" is used twice.`)
    codes.add(l.code)
  }
  const images = new Set(listImageIds(db))
  for (const b of t.blocks)
    if (b.imageId && !images.has(b.imageId))
      throw new Error('A section uses a picture that is no longer in the file.')
  setSetting(db, ctx, TEMPLATE_KEY, t)
  return t
}

export function resetLetterTemplate(db: LockerDb, ctx: OperatorContext): LetterTemplate {
  db.run('DELETE FROM settings WHERE key = $k', { $k: TEMPLATE_KEY })
  void ctx
  return letterTemplate(db)
}

// ---------------------------------------------------------------- pictures

function listImageIds(db: LockerDb): string[] {
  return db.all<{ id: string }>('SELECT id FROM image').map((r) => r.id)
}

/** The school's pictures. One whose type is not a picture type the app allows is left out. */
export function listImages(db: LockerDb): ImageView[] {
  return db
    .all<{
      id: string
      name: string
      mime: string
      data: Uint8Array
      width: number
      height: number
    }>('SELECT id, name, mime, data, width, height FROM image ORDER BY created_at')
    .flatMap((r) => {
      const dataUrl = imageDataUrl(r.data, r.mime)
      if (!dataUrl) return []
      return [
        {
          id: r.id,
          name: r.name,
          mime: r.mime,
          dataUrl,
          bytes: r.data.byteLength,
          width: r.width,
          height: r.height
        }
      ]
    })
}

export function letterImages(db: LockerDb): Map<string, LetterImage> {
  return new Map(
    listImages(db).map((i) => [i.id, { dataUrl: i.dataUrl, width: i.width, height: i.height }])
  )
}

export function addImage(
  db: LockerDb,
  ctx: OperatorContext,
  img: { name: string; mime: string; bytes: Uint8Array; width: number; height: number }
): string {
  if (!(LETTER_IMAGE_TYPES as readonly string[]).includes(img.mime))
    throw new Error('Pictures must be PNG, JPEG or SVG.')
  if (img.bytes.byteLength > MAX_LETTER_IMAGE_BYTES)
    throw new Error('That picture is over 3 MB. Use a smaller one.')
  if (img.bytes.byteLength === 0) throw new Error('That picture is empty.')
  const id = newId()
  const s = stamp(ctx)
  db.run(
    `INSERT INTO image (id, name, mime, data, width, height, created_at, updated_at, updated_by)
     VALUES ($id, $n, $m, $d, $w, $h, $at, $at, $by)`,
    {
      $id: id,
      $n: img.name.slice(0, 120),
      $m: img.mime,
      $d: img.bytes,
      $w: Math.max(1, Math.round(img.width)),
      $h: Math.max(1, Math.round(img.height)),
      $at: s.created_at,
      $by: s.updated_by
    }
  )
  return id
}

/** Removes a picture, and takes it out of any letter section that used it. */
export function deleteImage(db: LockerDb, ctx: OperatorContext, id: string): void {
  const t = letterTemplate(db)
  if (t.blocks.some((b) => b.imageId === id)) {
    const blocks = t.blocks
      .filter((b) => !(b.type === 'image' && b.imageId === id))
      .map((b) => (b.imageId === id ? { ...b, imageId: null } : b))
    setSetting(db, ctx, TEMPLATE_KEY, { ...t, blocks })
  }
  db.run('DELETE FROM image WHERE id = $id', { $id: id })
}

// ---------------------------------------------------------------- language

export function setStudentLanguage(
  db: LockerDb,
  ctx: OperatorContext,
  studentId: string,
  code: string | null
): void {
  const row = db.get<{ custom: string }>('SELECT custom FROM student WHERE id = $id', {
    $id: studentId
  })
  if (!row) throw new Error('That student is no longer in the file.')
  let custom: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(row.custom || '{}')
    if (parsed && typeof parsed === 'object') custom = parsed as Record<string, unknown>
  } catch {
    custom = {}
  }
  if (code) custom.language = code
  else delete custom.language
  db.run('UPDATE student SET custom = $c, updated_at = $at, updated_by = $by WHERE id = $id', {
    $id: studentId,
    $c: JSON.stringify(custom),
    $at: ctx.now().toISOString(),
    $by: ctx.operator
  })
}

function languageOf(custom: string | null): string | null {
  try {
    const parsed: unknown = JSON.parse(custom || '{}')
    if (parsed && typeof parsed === 'object' && 'language' in parsed) {
      const v = (parsed as { language: unknown }).language
      return typeof v === 'string' ? v : null
    }
  } catch {
    return null
  }
  return null
}

// ---------------------------------------------------------------- who gets a letter

interface Row {
  student_id: string
  locker_id: string
  first_name: string
  preferred_name: string | null
  last_name: string
  group_code: string | null
  year_level: string | null
  custom: string | null
  number: string
  bank: string
  bank_id: string
  area: string
  assigned_at: string
  lock_id: string | null
  lock_type: LockType | null
  code_status: CodeStatus | null
  code_cipher: Uint8Array | null
  key_number: string | null
}

export interface LetterSet {
  records: LetterRecord[]
  heldBack: HeldBack[]
  /** Codes by locker, decrypted, for the letters that need one. */
  codes: Map<string, string>
}

function kindOf(type: LockType | null): LetterRecord['kind'] {
  if (!type) return 'no_lock'
  const info = LOCK_TYPE_INFO[type]
  if (info.hasCode) return info.codeSettable ? 'settable' : 'fixed'
  return info.keyed ? 'keyed' : 'no_lock'
}

export function letterSet(
  db: LockerDb,
  selection: LetterSelection,
  usePreferred: boolean
): LetterSet {
  const map = groupMap(db)
  const rows = db.all<Row>(
    `SELECT s.id AS student_id, l.id AS locker_id, s.first_name, s.preferred_name, s.last_name,
            s.group_code, s.year_level, s.custom, l.number, b.name AS bank, b.id AS bank_id,
            a.name AS area, x.created_at AS assigned_at,
            k.id AS lock_id, k.type AS lock_type, k.code_status, k.code_cipher, k.key_number
       FROM assignment x
       JOIN student s ON s.id = x.student_id
       JOIN locker l ON l.id = x.locker_id
       JOIN bank b ON b.id = l.bank_id
       JOIN area a ON a.id = b.area_id
       LEFT JOIN lock k ON k.id = (SELECT id FROM lock WHERE locker_id = l.id AND status IN ('in_use','spare') LIMIT 1)
      WHERE x.status = 'current' AND l.archived_at IS NULL
      ORDER BY l.sort_key`
  )
  let chosen = rows
  switch (selection.mode) {
    case 'all':
      break
    case 'group':
      chosen = rows.filter((r) => r.group_code === selection.group)
      break
    case 'bank':
      chosen = rows.filter((r) => r.bank_id === selection.bankId)
      break
    case 'lockers': {
      const wanted = parseLockerList(
        selection.numbers,
        rows.map((r) => r.number)
      )
      chosen = rows.filter((r) => wanted.has(r.number))
      break
    }
    case 'student':
      chosen = rows.filter((r) => r.student_id === selection.studentId)
      break
    case 'changed': {
      // Per locker: a letter is due when that locker has had no letter printed since
      // its holder arrived or its code last changed. A letter held back for a reset
      // stays due until it has been printed.
      const printed = new Map(
        db
          .all<{ locker_id: string; at: string }>(
            `SELECT j.value AS locker_id, MAX(p.printed_at) AS at
               FROM print_job p, json_each(p.records) j
              WHERE p.kind = 'letters' GROUP BY j.value`
          )
          .map((r) => [r.locker_id, r.at])
      )
      const codeFrom = new Map(
        db
          .all<{ lock_id: string; at: string }>(
            'SELECT lock_id, MAX(from_date) AS at FROM code_history GROUP BY lock_id'
          )
          .map((r) => [r.lock_id, r.at])
      )
      chosen = rows.filter((r) => {
        const last = printed.get(r.locker_id)
        if (!last) return true
        const code = r.lock_id ? (codeFrom.get(r.lock_id) ?? '') : ''
        const since = code > r.assigned_at ? code : r.assigned_at
        return last < since
      })
      break
    }
  }
  const key = readCodeKey(db)
  const records: LetterRecord[] = []
  const heldBack: HeldBack[] = []
  const codes = new Map<string, string>()
  for (const r of chosen) {
    const first = usePreferred && r.preferred_name ? r.preferred_name : r.first_name
    const name = `${first} ${r.last_name}`
    const kind = kindOf(r.lock_type)
    if (kind === 'settable' || kind === 'fixed') {
      const reason =
        r.code_status === 'needs_new_code'
          ? 'The lock needs a new code first.'
          : r.code_status === 'awaiting_physical_reset'
            ? 'The lock must be reset to its new code first.'
            : r.code_status === 'reset_no_code'
              ? 'No code has been issued yet.'
              : null
      const code = key && r.code_cipher ? decryptCode(key, r.code_cipher) : null
      if (reason || !code) {
        heldBack.push({ name, locker: r.number, reason: reason ?? 'No code is recorded.' })
        continue
      }
      codes.set(r.locker_id, code)
    }
    records.push({
      studentId: r.student_id,
      lockerId: r.locker_id,
      firstName: first,
      lastName: r.last_name,
      group: displayGroup(r.group_code, map),
      yearLevel: r.year_level,
      locker: r.number,
      bank: r.bank,
      area: r.area,
      lockType: r.lock_type ? LOCK_TYPE_INFO[r.lock_type].name.toLowerCase() : 'no lock',
      kind,
      keyNumber: r.key_number,
      language: languageOf(r.custom)
    })
  }
  records.sort((a, b) => compareLockerNumbers(a.locker, b.locker))
  return { records, heldBack, codes }
}

export function letterSchool(db: LockerDb, template: LetterTemplate): LetterSchool {
  const p = getSchoolProfile(db)
  return {
    name: p.name,
    logo: template.colour === 'mono' ? (p.monoLogoDataUrl ?? p.logoDataUrl) : p.logoDataUrl,
    primary: p.colourPrimary ?? '#1F3A5F',
    accent: p.colourAccent ?? '#E8A33D',
    stripes: p.colourStripes
  }
}

/** The language for one student in a print job. */
export function chooseLanguage(
  template: LetterTemplate,
  language: LetterLanguage,
  record: LetterRecord
): string {
  const codes = template.languages.map((l) => l.code)
  const first = codes[0] ?? 'en'
  if (language.kind === 'one') return codes.includes(language.code) ? language.code : first
  return record.language && codes.includes(record.language) ? record.language : first
}

export function letterItems(
  set: LetterSet,
  template: LetterTemplate,
  language: LetterLanguage,
  masked: boolean
): LetterItem[] {
  return set.records.map((record) => ({
    record,
    code: set.codes.get(record.lockerId) ?? null,
    masked,
    lang: chooseLanguage(template, language, record)
  }))
}
