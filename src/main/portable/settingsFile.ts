import { z } from 'zod'
import { LabelTemplateSchema } from '@shared/labels'
import { LetterTemplateSchema } from '@shared/letters'
import { TerminologySchema } from '@shared/terminology'
import type { LockerDb } from '../db/db'
import type { OperatorContext } from '../db/context'
import { labelTemplate, saveLabelTemplate } from '../repos/labels'
import { addImage, letterTemplate } from '../repos/letters'
import { getTerms, setTerms } from '../repos/school'
import { setSetting } from '../repos/settings'

// A school's set-up as a .lockersettings file (SPEC.md 7): words, code rules, lock
// defaults, label sheets and layout, printer nudges, the letter and its pictures,
// and import column choices. Never students, lockers, codes, the PIN or history.

const SHARED_KEYS = [
  'codes.rules',
  'locks.defaults',
  'labels.measured',
  'labels.customStocks',
  'labels.printers',
  'import.options',
  'import.savedMappings'
] as const

const ImageSchema = z.object({
  id: z.string().max(64),
  name: z.string().max(120),
  mime: z.enum(['image/png', 'image/jpeg', 'image/svg+xml']),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  base64: z.string().max(5_000_000)
})

export const SettingsFileSchema = z.object({
  format: z.literal('lockersettings'),
  version: z.literal(1),
  exportedAt: z.string(),
  appVersion: z.string(),
  fromSchool: z.string(),
  terminology: TerminologySchema,
  labelTemplate: LabelTemplateSchema,
  letterTemplate: LetterTemplateSchema,
  images: z.array(ImageSchema).max(50),
  settings: z.partialRecord(z.enum(SHARED_KEYS), z.unknown())
})
export type SettingsFile = z.infer<typeof SettingsFileSchema>

export function exportSettings(db: LockerDb, appVersion: string, now: Date): SettingsFile {
  const settings: Partial<Record<(typeof SHARED_KEYS)[number], unknown>> = {}
  for (const key of SHARED_KEYS) {
    const row = db.get<{ value: string }>('SELECT value FROM settings WHERE key = $k', { $k: key })
    if (row) settings[key] = JSON.parse(row.value)
  }
  const images = db
    .all<{
      id: string
      name: string
      mime: string
      data: Uint8Array
      width: number
      height: number
    }>('SELECT id, name, mime, data, width, height FROM image')
    .map((i) => ({
      id: i.id,
      name: i.name,
      mime: i.mime as 'image/png',
      width: i.width,
      height: i.height,
      base64: Buffer.from(i.data).toString('base64')
    }))
  return {
    format: 'lockersettings',
    version: 1,
    exportedAt: now.toISOString(),
    appVersion,
    fromSchool: db.get<{ name: string }>('SELECT name FROM school LIMIT 1')?.name ?? '',
    terminology: getTerms(db),
    labelTemplate: labelTemplate(db),
    letterTemplate: letterTemplate(db),
    images,
    settings
  }
}

export function parseSettingsFile(text: string): SettingsFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('That file is not a Locker Manager settings file.')
  }
  const parsed = SettingsFileSchema.safeParse(raw)
  if (!parsed.success)
    throw new Error('That file is not a Locker Manager settings file, or it is damaged.')
  return parsed.data
}

/** Applies a settings file to the open file. Pictures are added; nothing is deleted. */
export function importSettings(
  db: LockerDb,
  ctx: OperatorContext,
  file: SettingsFile
): { fromSchool: string; pictures: number } {
  setTerms(db, ctx, file.terminology)
  for (const [key, value] of Object.entries(file.settings)) setSetting(db, ctx, key, value)
  saveLabelTemplate(db, ctx, file.labelTemplate)
  const ids = new Map<string, string>()
  for (const img of file.images)
    ids.set(
      img.id,
      addImage(db, ctx, {
        name: img.name,
        mime: img.mime,
        bytes: new Uint8Array(Buffer.from(img.base64, 'base64')),
        width: img.width,
        height: img.height
      })
    )
  const letter = {
    ...file.letterTemplate,
    blocks: file.letterTemplate.blocks.map((b) => ({
      ...b,
      imageId: b.imageId ? (ids.get(b.imageId) ?? null) : null
    }))
  }
  setSetting(db, ctx, 'letters.template', LetterTemplateSchema.parse(letter))
  return { fromSchool: file.fromSchool, pictures: ids.size }
}
