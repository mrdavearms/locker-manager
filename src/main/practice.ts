import { appendAudit, newId, setMeta, type OperatorContext } from './db/context'
import { LockerDb } from './db/db'

/**
 * A practice copy of the school's file (SPEC.md 10). On a computer that is not editing,
 * codes stay locked (decision 22): the copy then has no codes, no spare codes, no seeds
 * and no code key, and the freed space is wiped, so the codes cannot be got back from it.
 */
export async function makePracticeCopy(
  bytes: Uint8Array,
  ctx: OperatorContext,
  opts: { withCodes: boolean }
): Promise<LockerDb> {
  const db = await LockerDb.fromBytes(bytes)
  if (!opts.withCodes) db.run('PRAGMA secure_delete = ON')
  db.transaction(() => {
    setMeta(db, 'practice', '1')
    setMeta(db, 'file_id', newId())
    if (!opts.withCodes) {
      removeAllCodes(db)
      setMeta(db, 'practice_no_codes', '1')
    }
    appendAudit(db, ctx, { action: 'practice.started', entity: 'file' })
  })
  if (!opts.withCodes) db.run('VACUUM')
  return db
}

function removeAllCodes(db: LockerDb): void {
  db.run("DELETE FROM meta WHERE key = 'code_key_v1'")
  db.run(
    `UPDATE lock SET code_cipher = NULL, master_code_cipher = NULL,
       code_status = CASE WHEN code_status IN ('set', 'awaiting_physical_reset')
                          THEN 'needs_new_code' ELSE code_status END`
  )
  db.run('UPDATE code_history SET code_cipher = NULL')
  db.run('DELETE FROM code_set_entry')
  db.run('UPDATE code_set SET seed = NULL')
}
