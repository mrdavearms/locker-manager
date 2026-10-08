import type { SchoolProfile } from '@shared/locations'
import { resolveTerms, type Terminology } from '@shared/terminology'
import type { LockerDb } from '../db/db'
import type { OperatorContext } from '../db/context'
import { imageDataUrl } from '../render/html'
import { setSetting } from './settings'

type SchoolRow = {
  id: string
  name: string
  short_name: string | null
  colour_primary: string | null
  colour_accent: string | null
  colour_stripes: string
  address: string | null
  logo: Uint8Array | null
  logo_type: string | null
  logo_mono: Uint8Array | null
  logo_mono_type: string | null
  terminology: string
}

function row(db: LockerDb): SchoolRow {
  const r = db.get<SchoolRow>('SELECT * FROM school LIMIT 1')
  if (!r) throw new Error('This file has no school in it.')
  return r
}

const dataUrl = imageDataUrl

export function getSchoolProfile(db: LockerDb): SchoolProfile {
  const r = row(db)
  let stripes: string[] = []
  try {
    const parsed: unknown = JSON.parse(r.colour_stripes)
    if (Array.isArray(parsed)) stripes = parsed.filter((x): x is string => typeof x === 'string')
  } catch {
    stripes = []
  }
  return {
    name: r.name,
    shortName: r.short_name,
    colourPrimary: r.colour_primary,
    colourAccent: r.colour_accent,
    colourStripes: stripes,
    address: r.address,
    hasLogo: r.logo !== null,
    hasMonoLogo: r.logo_mono !== null,
    logoDataUrl: dataUrl(r.logo, r.logo_type),
    monoLogoDataUrl: dataUrl(r.logo_mono, r.logo_mono_type)
  }
}

export interface SchoolPatch {
  name?: string
  shortName?: string | null
  colourPrimary?: string | null
  colourAccent?: string | null
  colourStripes?: string[]
  address?: string | null
}

const HEX = /^#[0-9a-f]{6}$/i

export function updateSchoolProfile(
  db: LockerDb,
  ctx: OperatorContext,
  patch: SchoolPatch
): SchoolProfile {
  const before = getSchoolProfile(db)
  const r = row(db)
  for (const c of [patch.colourPrimary, patch.colourAccent, ...(patch.colourStripes ?? [])]) {
    if (c && !HEX.test(c)) throw new Error(`"${c}" is not a colour like #1F4E8C.`)
  }
  if (patch.colourStripes && patch.colourStripes.length > 3)
    throw new Error('Up to three stripe colours.')
  if (patch.name !== undefined && patch.name.trim().length === 0)
    throw new Error('The school needs a name.')
  db.run(
    `UPDATE school SET
       name = COALESCE($name, name),
       short_name = CASE WHEN $setShort THEN $short ELSE short_name END,
       colour_primary = CASE WHEN $setP THEN $p ELSE colour_primary END,
       colour_accent = CASE WHEN $setA THEN $a ELSE colour_accent END,
       colour_stripes = COALESCE($stripes, colour_stripes),
       address = CASE WHEN $setAddr THEN $addr ELSE address END,
       updated_at = $at, updated_by = $by
     WHERE id = $id`,
    {
      $name: patch.name?.trim() ?? null,
      $setShort: patch.shortName !== undefined ? 1 : 0,
      $short: patch.shortName?.trim() || null,
      $setP: patch.colourPrimary !== undefined ? 1 : 0,
      $p: patch.colourPrimary ?? null,
      $setA: patch.colourAccent !== undefined ? 1 : 0,
      $a: patch.colourAccent ?? null,
      $stripes: patch.colourStripes ? JSON.stringify(patch.colourStripes) : null,
      $setAddr: patch.address !== undefined ? 1 : 0,
      $addr: patch.address?.trim() || null,
      $at: ctx.now().toISOString(),
      $by: ctx.operator,
      $id: r.id
    }
  )
  void before
  return getSchoolProfile(db)
}

export const LOGO_TYPES = ['image/png', 'image/svg+xml', 'image/jpeg'] as const
export const MAX_LOGO_BYTES = 2 * 1024 * 1024

export function setLogo(
  db: LockerDb,
  ctx: OperatorContext,
  which: 'colour' | 'mono',
  bytes: Uint8Array | null,
  type: (typeof LOGO_TYPES)[number] | null
): void {
  if (bytes && bytes.byteLength > MAX_LOGO_BYTES)
    throw new Error('That picture is over 2 MB. Use a smaller one.')
  if (bytes && (!type || !LOGO_TYPES.includes(type)))
    throw new Error('The logo must be a PNG, JPEG or SVG picture.')
  const r = row(db)
  const cols = which === 'colour' ? ['logo', 'logo_type'] : ['logo_mono', 'logo_mono_type']
  db.run(
    `UPDATE school SET ${cols[0]} = $b, ${cols[1]} = $t, updated_at = $at, updated_by = $by WHERE id = $id`,
    {
      $b: bytes,
      $t: bytes ? type : null,
      $at: ctx.now().toISOString(),
      $by: ctx.operator,
      $id: r.id
    }
  )
}

export function getTerms(db: LockerDb): Terminology {
  return resolveTerms(JSON.parse(row(db).terminology || '{}'))
}

export function setTerms(db: LockerDb, ctx: OperatorContext, terms: Terminology): void {
  const r = row(db)
  db.run('UPDATE school SET terminology = $t, updated_at = $at, updated_by = $by WHERE id = $id', {
    $t: JSON.stringify(terms),
    $at: ctx.now().toISOString(),
    $by: ctx.operator,
    $id: r.id
  })
  setSetting(db, ctx, 'terminology.updated', ctx.now().toISOString())
}
