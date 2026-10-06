import { LockerDb } from './db'
import { appendAudit, newId, setMeta, stamp, type OperatorContext } from './context'
import { migrate } from './migrate'

export interface NewFileOptions {
  schoolName: string
  appVersion: string
  demo?: boolean
}

/**
 * A brand-new data file: the newest schema, the school, and this calendar year as
 * the active school year. Returns the database; the caller saves it.
 */
export async function createNewDatabase(
  ctx: OperatorContext,
  opts: NewFileOptions
): Promise<LockerDb> {
  const name = opts.schoolName.trim()
  if (name.length === 0) throw new Error('The school needs a name.')
  const db = await LockerDb.create()
  migrate(db)
  const now = ctx.now()
  const year = now.getFullYear()
  db.transaction(() => {
    setMeta(db, 'file_id', newId())
    setMeta(db, 'created_at', now.toISOString())
    setMeta(db, 'created_with_app_version', opts.appVersion)
    setMeta(db, 'demo', opts.demo ? '1' : '0')
    const s = stamp(ctx)
    const schoolId = newId()
    db.run(
      `INSERT INTO school (id, name, created_at, updated_at, updated_by)
       VALUES ($id, $name, $c, $u, $by)`,
      { $id: schoolId, $name: name, $c: s.created_at, $u: s.updated_at, $by: s.updated_by }
    )
    db.run(
      `INSERT INTO school_year (id, label, start_date, end_date, status, created_at, updated_at, updated_by)
       VALUES ($id, $label, $start, $end, 'active', $c, $u, $by)`,
      {
        $id: newId(),
        $label: String(year),
        $start: `${year}-01-01`,
        $end: `${year}-12-31`,
        $c: s.created_at,
        $u: s.updated_at,
        $by: s.updated_by
      }
    )
    appendAudit(db, ctx, {
      action: 'file.created',
      entity: 'school',
      entityId: schoolId,
      after: { name }
    })
  })
  return db
}
