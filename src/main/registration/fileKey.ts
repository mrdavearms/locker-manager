import { getMeta, setMeta } from '../db/context'
import type { LockerDb } from '../db/db'

/** Where a school's file keeps its registration key (meta table, no migration needed). */
export const FILE_KEY_META = 'registration_v1'

export function readFileKey(db: LockerDb): string | null {
  return getMeta(db, FILE_KEY_META) ?? null
}

export function writeFileKey(db: LockerDb, key: string): void {
  setMeta(db, FILE_KEY_META, key)
}
