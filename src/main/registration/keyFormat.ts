import { sign, verify, type KeyObject } from 'node:crypto'
import { z } from 'zod'
import { KEY_PREFIX, type RegistrationDetails } from '@shared/registration'

export type KeyCheck =
  | { ok: true; details: RegistrationDetails }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'unknown_version' }

const DATE = /^\d{4}-\d{2}-\d{2}$/

const detailsSchema = z
  .object({
    v: z.literal(1),
    id: z.string(),
    school: z.string(),
    name: z.string(),
    email: z.string(),
    issued: z.string().regex(DATE),
    plan: z.literal('free'),
    expires: z.string().regex(DATE).nullable()
  })
  .strict()

const BASE64URL = /^[A-Za-z0-9_-]+$/

const INVISIBLE = new RegExp('[\\s\\u200B-\\u200D\\uFEFF]', 'g')

/** Removes spaces, line breaks and invisible characters that creep in when a key is pasted from an email. */
export function cleanKeyText(text: string): string {
  return text.replace(INVISIBLE, '')
}

export function signKey(details: RegistrationDetails, privateKey: KeyObject): string {
  const body = Buffer.from(JSON.stringify(details), 'utf8').toString('base64url')
  const signature = sign(null, Buffer.from(body, 'ascii'), privateKey).toString('base64url')
  return `${KEY_PREFIX}${body}.${signature}`
}

const malformed: KeyCheck = { ok: false, reason: 'malformed' }

export function checkKey(text: string, publicKeys: KeyObject[], now: Date): KeyCheck {
  const clean = cleanKeyText(text)
  if (!clean.startsWith(KEY_PREFIX)) return malformed
  const parts = clean.slice(KEY_PREFIX.length).split('.')
  if (parts.length !== 2) return malformed
  const [body, sig] = parts as [string, string]
  if (!BASE64URL.test(body) || !BASE64URL.test(sig)) return malformed

  let json: unknown
  try {
    json = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return malformed
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return malformed
  const version = (json as { v?: unknown }).v
  if (typeof version === 'number' && version !== 1) return { ok: false, reason: 'unknown_version' }
  const parsed = detailsSchema.safeParse(json)
  if (!parsed.success) return malformed

  const signature = Buffer.from(sig, 'base64url')
  const data = Buffer.from(body, 'ascii')
  const signedByUs = publicKeys.some((key) => {
    try {
      return verify(null, data, key, signature)
    } catch {
      return false
    }
  })
  if (!signedByUs) return { ok: false, reason: 'bad_signature' }

  const details = parsed.data
  if (details.expires !== null) {
    const [y = 0, m = 1, d = 1] = details.expires.split('-').map(Number)
    const endOfDay = new Date(y, m - 1, d, 23, 59, 59, 999)
    if (now.getTime() > endOfDay.getTime()) return { ok: false, reason: 'expired' }
  }
  return { ok: true, details }
}
