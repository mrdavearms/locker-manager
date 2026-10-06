import type { z } from 'zod'
import type { LockerDb } from '../db/db'
import type { OperatorContext } from '../db/context'

// Settings live in the data file as key / JSON rows (SPEC.md 3.1), each read
// through a Zod schema with a default, so an old or damaged value never breaks
// the app: it falls back to the default.

export function getSetting<S extends z.ZodType>(
  db: LockerDb,
  key: string,
  schema: S,
  fallback: z.infer<S>
): z.infer<S> {
  const row = db.get<{ value: string }>('SELECT value FROM settings WHERE key = $k', { $k: key })
  if (!row) return fallback
  try {
    const parsed = schema.safeParse(JSON.parse(String(row.value)))
    return parsed.success ? parsed.data : fallback
  } catch {
    return fallback
  }
}

export function setSetting(db: LockerDb, ctx: OperatorContext, key: string, value: unknown): void {
  const at = ctx.now().toISOString()
  db.run(
    `INSERT INTO settings (key, value, version, created_at, updated_at, updated_by)
     VALUES ($k, $v, 1, $at, $at, $by)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, version = settings.version + 1,
       updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    { $k: key, $v: JSON.stringify(value), $at: at, $by: ctx.operator }
  )
}
