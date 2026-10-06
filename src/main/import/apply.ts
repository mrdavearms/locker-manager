import type { ImportAnalysis, ImportResult, ImportSelections } from '@shared/importTypes'
import type { LockerDb } from '../db/db'
import { newId, stamp, type OperatorContext } from '../db/context'

// Applies the ticked parts of an import in one transaction (the caller's
// session.write gives the transaction, history entry and undo point).
// An import never removes a student or an assignment (SPEC.md 4.2).

export function applyImport(
  db: LockerDb,
  ctx: OperatorContext,
  a: ImportAnalysis,
  sel: ImportSelections,
  summary: { files: string[]; profile: string }
): ImportResult {
  const s = stamp(ctx)
  const today = s.created_at.slice(0, 10)
  const batchId = newId()
  const add = new Set(sel.add)
  const update = new Set(sel.update)
  const markMissing = new Set(sel.markMissing)
  let added = 0
  let updated = 0
  let markedMissing = 0

  db.run(
    `INSERT INTO import_batch (id, files, profile, summary, applied_at, applied_by, created_at, updated_at, updated_by)
     VALUES ($id, $files, $profile, '{}', $at, $by, $at, $at, $by)`,
    {
      $id: batchId,
      $files: JSON.stringify(summary.files),
      $profile: summary.profile,
      $at: s.created_at,
      $by: s.updated_by
    }
  )

  const byExternal = new Map(a.students.map((st) => [st.externalId, st]))
  for (const st of a.newStudents) {
    if (!add.has(st.externalId)) continue
    db.run(
      `INSERT INTO student (id, external_id, first_name_raw, last_name_raw, preferred_name_raw, first_name, last_name, preferred_name,
                            year_level, group_code, house, gender, email, name_check, source_import_id, first_seen, last_seen,
                            created_at, updated_at, updated_by)
       VALUES ($id, $e, $fr, $lr, $pr, $f, $l, $p, $y, $g, $h, $gender, $email, $check, $batch, $today, $today, $c, $c, $by)`,
      {
        $id: newId(),
        $e: st.externalId,
        $fr: st.firstNameRaw,
        $lr: st.lastNameRaw,
        $pr: st.preferredNameRaw,
        $f: st.firstName,
        $l: st.lastName,
        $p: st.preferredName,
        $y: st.yearLevel,
        $g: st.groupCode,
        $h: st.house,
        $gender: st.gender,
        $email: st.email,
        $check: JSON.stringify(st.nameCheck),
        $batch: batchId,
        $today: today,
        $c: s.created_at,
        $by: s.updated_by
      }
    )
    added++
  }

  for (const ch of a.changed) {
    const st = byExternal.get(ch.externalId)
    if (!st) continue
    if (update.has(ch.studentId)) {
      const nameChange = ch.changes.some((c) => c.field === 'name')
      db.run(
        `UPDATE student SET
           first_name_raw = $fr, last_name_raw = $lr, preferred_name_raw = $pr,
           first_name = CASE WHEN name_override = 1 THEN first_name ELSE $f END,
           last_name = CASE WHEN name_override = 1 THEN last_name ELSE $l END,
           preferred_name = CASE WHEN name_override = 1 THEN preferred_name ELSE $p END,
           name_check = CASE WHEN $nameChange THEN $check ELSE name_check END,
           year_level = $y, group_code = $g, house = COALESCE($h, house), gender = COALESCE($gender, gender), email = COALESCE($email, email),
           active = 1, left_at = NULL, not_in_import_since = NULL, last_seen = $today, updated_at = $c, updated_by = $by
         WHERE id = $id`,
        {
          $id: ch.studentId,
          $fr: st.firstNameRaw,
          $lr: st.lastNameRaw,
          $pr: st.preferredNameRaw,
          $f: st.firstName,
          $l: st.lastName,
          $p: st.preferredName,
          $nameChange: nameChange ? 1 : 0,
          $check: JSON.stringify(st.nameCheck),
          $y: st.yearLevel,
          $g: st.groupCode,
          $h: st.house,
          $gender: st.gender,
          $email: st.email,
          $today: today,
          $c: s.created_at,
          $by: s.updated_by
        }
      )
      updated++
    } else {
      db.run('UPDATE student SET last_seen = $today, not_in_import_since = NULL WHERE id = $id', {
        $id: ch.studentId,
        $today: today
      })
    }
  }

  // Everyone who was in the import is "seen", changed or not.
  const seenIds = [...byExternal.keys()]
  for (let i = 0; i < seenIds.length; i += 400) {
    const chunk = seenIds.slice(i, i + 400)
    const params: Record<string, string> = { $today: today }
    chunk.forEach((id, j) => (params[`$e${j}`] = id))
    db.run(
      `UPDATE student SET last_seen = $today, not_in_import_since = NULL WHERE active = 1 AND external_id IN (${chunk.map((_, j) => `$e${j}`).join(',')})`,
      params
    )
  }

  for (const l of a.leavers) {
    if (!markMissing.has(l.studentId)) continue
    db.run(
      'UPDATE student SET not_in_import_since = COALESCE(not_in_import_since, $today), updated_at = $c, updated_by = $by WHERE id = $id',
      {
        $id: l.studentId,
        $today: today,
        $c: s.created_at,
        $by: s.updated_by
      }
    )
    markedMissing++
  }

  const result = { added, updated, markedMissing, seen: seenIds.length }
  db.run('UPDATE import_batch SET summary = $s WHERE id = $id', {
    $s: JSON.stringify(result),
    $id: batchId
  })
  return result
}
