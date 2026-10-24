import type { KeyObject } from 'node:crypto'
import type { DataFileSession } from '../file/session'
import type { Preferences } from '../prefs/preferences'
import { readFileKey, writeFileKey } from './fileKey'
import { keysAfterOpen } from './policy'

/**
 * After a school's file opens: a computer with no key takes the file's key, and a
 * computer that is editing puts its own (or IT's) key into a file that has none.
 * A valid key is never replaced, on either side (registration design 6.5). The
 * write has no replay, so a conflict merge may leave it out; the next open puts it back.
 */
export async function applyKeysAfterOpen(
  session: DataFileSession,
  prefs: Preferences,
  deps: { itKey: string | null; publicKeys: KeyObject[]; now: Date }
): Promise<void> {
  const st = session.state
  if (st.status !== 'open' || st.summary.demo || st.summary.practice) return
  const { saveToComputer, writeToFile } = keysAfterOpen({
    fileKey: session.read(readFileKey),
    computerKey: prefs.get().registrationKey,
    itKey: deps.itKey,
    mode: st.mode,
    publicKeys: deps.publicKeys,
    now: deps.now
  })
  if (writeToFile && st.mode === 'edit' && !st.conflict) {
    session.write({ action: 'registration.added', entity: 'file' }, (db) =>
      writeFileKey(db, writeToFile)
    )
  }
  if (saveToComputer) await prefs.update((p) => ({ ...p, registrationKey: saveToComputer }))
}
