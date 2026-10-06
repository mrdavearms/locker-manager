import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { PrivacyView } from '@shared/privacy'
import type { LockerDb } from './db/db'
import type { OperatorContext } from './db/context'
import { readManaged } from './managed'
import { revealCode } from './repos/codes'
import { getSetting, setSetting } from './repos/settings'

// Privacy (SPEC.md 7 item 12, 11): an optional PIN before codes are shown, and how
// long a shown code stays on screen. The PIN keeps codes from casual view; it is not
// protection against a determined person who has the file, and Settings says so.
// After a correct PIN, codes can be shown for 10 minutes on this computer.

const KEY = 'privacy'
const PrivacySchema = z.object({
  pinHash: z.string().nullable().default(null),
  autoHideSeconds: z.number().int().min(5).max(600).default(30)
})
const UNLOCK_MS = 10 * 60 * 1000

let unlockedUntil = 0
let failures = 0
let waitUntil = 0
let currentFile: string | null = null

/** A different file (or none) starts locked again. */
export function noteOpenFile(path: string | null): void {
  if (path !== currentFile) {
    currentFile = path
    unlockedUntil = 0
    failures = 0
  }
}

function stored(db: LockerDb): z.infer<typeof PrivacySchema> {
  return getSetting(db, KEY, PrivacySchema, PrivacySchema.parse({}))
}

function hashPin(pin: string): string {
  const salt = randomBytes(16)
  return `scrypt$${salt.toString('base64')}$${scryptSync(pin, salt, 32).toString('base64')}`
}

function pinMatches(hash: string, pin: string): boolean {
  const [kind, salt, want] = hash.split('$')
  if (kind !== 'scrypt' || !salt || !want) return false
  const got = scryptSync(pin, Buffer.from(salt, 'base64'), 32)
  const w = Buffer.from(want, 'base64')
  return w.length === got.length && timingSafeEqual(w, got)
}

export function privacyView(db: LockerDb, now = Date.now()): PrivacyView {
  const p = stored(db)
  const managedRequires = readManaged().managed.requirePinForCodes === true
  return {
    pinSet: p.pinHash !== null,
    autoHideSeconds: p.autoHideSeconds,
    required: p.pinHash !== null || managedRequires,
    managedRequires,
    unlocked: now < unlockedUntil
  }
}

/** Why codes cannot be shown right now, or null when they can. */
export function codesLocked(db: LockerDb, now = Date.now()): string | null {
  const v = privacyView(db, now)
  if (v.managedRequires && !v.pinSet)
    return 'Your IT team requires a PIN before codes are shown. Set one in Settings, Privacy.'
  if (v.required && !v.unlocked) return 'Enter the PIN to show codes.'
  return null
}

export function assertCodesAllowed(db: LockerDb): void {
  const why = codesLocked(db)
  if (why) throw new Error(why)
}

/** A code just issued, shown on screen (and logged), or held back while locked. */
export function shownCode(
  db: LockerDb,
  ctx: OperatorContext,
  lockerId: string,
  code: string | null
): string | null {
  if (code === null || codesLocked(db)) return null
  return revealCode(db, ctx, lockerId, 'screen')
}

export function unlockCodes(db: LockerDb, pin: string, now = Date.now()): PrivacyView {
  const p = stored(db)
  if (!p.pinHash) throw new Error('No PIN has been set for this file.')
  if (now < waitUntil)
    throw new Error(
      `Too many wrong PINs. Try again in ${Math.ceil((waitUntil - now) / 1000)} seconds.`
    )
  if (!pinMatches(p.pinHash, pin)) {
    failures++
    if (failures >= 5) {
      waitUntil = now + 30_000
      failures = 0
    }
    throw new Error('That PIN is not right.')
  }
  failures = 0
  unlockedUntil = now + UNLOCK_MS
  return privacyView(db, now)
}

export function lockCodes(): void {
  unlockedUntil = 0
}

export function setPin(
  db: LockerDb,
  ctx: OperatorContext,
  pin: string | null,
  currentPin: string | null
): PrivacyView {
  const p = stored(db)
  if (p.pinHash && !(currentPin && pinMatches(p.pinHash, currentPin)))
    throw new Error('Enter the current PIN first.')
  if (pin !== null && !/^\d{4,8}$/.test(pin)) throw new Error('A PIN is 4 to 8 digits.')
  if (pin === null && readManaged().managed.requirePinForCodes)
    throw new Error('Your IT team requires a PIN, so it cannot be removed.')
  setSetting(db, ctx, KEY, { ...p, pinHash: pin === null ? null : hashPin(pin) })
  unlockedUntil = 0
  return privacyView(db)
}

export function setAutoHide(db: LockerDb, ctx: OperatorContext, seconds: number): PrivacyView {
  setSetting(db, ctx, KEY, { ...stored(db), autoHideSeconds: seconds })
  return privacyView(db)
}
