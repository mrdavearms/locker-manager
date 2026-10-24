import { createPublicKey, type KeyObject } from 'node:crypto'
import type { RegistrationView } from '@shared/ipc'
import type { LockerDb } from '../db/db'
import { installed, readItRegistrationKey } from '../managed'
import type { Preferences, Prefs } from '../prefs/preferences'
import { readFileKey } from './fileKey'
import { checkKey, cleanKeyText, type KeyCheck } from './keyFormat'
import { registrationStatus, type RegistrationStatus } from './policy'

/** Base64 SPKI DER of the key that checks real registration keys. Set in task 11. */
export const PRODUCTION_PUBLIC_KEY: string | null = null

type Reason = Extract<KeyCheck, { ok: false }>['reason']

let getPrefs: (() => Preferences) | null = null

/** Called once from index.ts after the preferences load. Kept as a getter so this file never imports fileService. */
export function initRegistration(prefs: () => Preferences): void {
  getPrefs = prefs
}

function toKey(base64: string): KeyObject | null {
  try {
    return createPublicKey({ key: Buffer.from(base64, 'base64'), format: 'der', type: 'spki' })
  } catch {
    return null
  }
}

/** The production key, plus the test key from the environment when this is not an installed copy. */
export function publicKeys(): KeyObject[] {
  const keys: KeyObject[] = []
  if (PRODUCTION_PUBLIC_KEY) {
    const key = toKey(PRODUCTION_PUBLIC_KEY)
    if (key) keys.push(key)
  }
  const test = !installed() ? process.env.LOCKER_MANAGER_REG_TEST_PUBKEY : undefined
  if (test) {
    const key = toKey(test)
    if (key) keys.push(key)
  }
  return keys
}

/**
 * Throws unless `key` is a base64 SPKI Ed25519 public key. The self-test runs it on an
 * installed copy, so a release that could not check any key (and would lock every school
 * out) never ships.
 */
export function checkProductionKey(key: string | null): void {
  if (!key) throw new Error('no registration key is built in (PRODUCTION_PUBLIC_KEY is null)')
  const parsed = toKey(key)
  if (!parsed) throw new Error('the built-in registration key does not parse as a public key')
  if (parsed.asymmetricKeyType !== 'ed25519')
    throw new Error('the built-in registration key is not an Ed25519 public key')
}

/** An installed copy always enforces; a development copy only when a test asks. */
export function enforced(): boolean {
  return installed() || process.env.LOCKER_MANAGER_REGISTRATION === 'enforce'
}

const DEV_STATUS: RegistrationStatus = {
  state: 'registered',
  source: 'computer',
  key: 'DEV',
  details: {
    v: 1,
    id: 'DEV',
    school: 'Development copy',
    name: 'Developer',
    email: 'dev@localhost',
    issued: '2026-10-25',
    plan: 'free',
    expires: null
  }
}

export function statusFor(db: LockerDb | null): RegistrationStatus {
  if (!enforced()) return DEV_STATUS
  const prefs: Prefs | undefined = getPrefs?.().get()
  return registrationStatus({
    computerKey: prefs?.registrationKey ?? null,
    itKey: readItRegistrationKey(),
    fileKey: db ? readFileKey(db) : null,
    publicKeys: publicKeys(),
    now: new Date()
  })
}

function formatDate(iso: string): string {
  const [y = 0, m = 1, d = 1] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })
}

/** What staff are told when a key does not work. `expires` is 'YYYY-MM-DD'. */
export function keyProblemMessage(reason: Reason, expires?: string | null): string {
  switch (reason) {
    case 'malformed':
      return "That doesn't look like a Locker Manager key. Copy the whole key from the email, starting with LM1."
    case 'bad_signature':
      return "That key isn't valid. Check you copied all of it, or ask for a new one."
    case 'expired':
      return expires
        ? `That key expired on ${formatDate(expires)}. Ask for a new one.`
        : 'That key has expired. Ask for a new one.'
    case 'unknown_version':
      return 'That key is for a newer version of Locker Manager. Update the app, then try again.'
  }
}

/** The expiry date inside a key whose signature already checked out. */
function expiryOf(text: string): string | null {
  try {
    const body = cleanKeyText(text).slice(4).split('.')[0] ?? ''
    const json = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      expires?: unknown
    }
    return typeof json.expires === 'string' ? json.expires : null
  } catch {
    return null
  }
}

export async function enterKey(
  text: string
): Promise<{ ok: true; status: RegistrationStatus } | { ok: false; message: string }> {
  const check = checkKey(text, publicKeys(), new Date())
  if (!check.ok) return { ok: false, message: keyProblemMessage(check.reason, expiryOf(text)) }
  const prefs = getPrefs?.()
  if (!prefs)
    return { ok: false, message: 'Locker Manager is still starting. Try again in a moment.' }
  const key = cleanKeyText(text)
  await prefs.update((p) => ({ ...p, registrationKey: key }))
  return {
    ok: true,
    status: { state: 'registered', details: check.details, source: 'computer', key }
  }
}

/** What the window may know about a status: never the key itself. */
export function toRegistrationView(
  status: RegistrationStatus,
  enforced: boolean
): RegistrationView {
  if (status.state === 'unregistered')
    return { state: 'unregistered', school: null, id: null, email: null, source: null, enforced }
  const { school, id, email } = status.details
  return { state: 'registered', school, id, email, source: status.source, enforced }
}
