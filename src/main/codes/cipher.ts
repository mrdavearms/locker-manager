import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import type { LockerDb } from '../db/db'
import { getMeta, setMeta } from '../db/context'

// Codes at rest (SPEC.md 8.6): AES-256-GCM with a key kept inside the data file.
// This stops casual viewing in a database tool. It is not protection against a
// determined attacker who has the file, and the settings screen says so.

const KEY_META = 'code_key_v1'

export function codeKey(db: LockerDb): Buffer {
  const stored = getMeta(db, KEY_META)
  if (stored) return Buffer.from(stored, 'base64')
  const key = randomBytes(32)
  setMeta(db, KEY_META, key.toString('base64'))
  return key
}

/** iv (12) + tag (16) + ciphertext. */
export function encryptCode(key: Buffer, code: string): Uint8Array {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([c.update(code, 'utf8'), c.final()])
  return new Uint8Array(Buffer.concat([iv, c.getAuthTag(), body]))
}

export function decryptCode(key: Buffer, blob: Uint8Array | null): string | null {
  if (!blob || blob.byteLength < 29) return null
  const b = Buffer.from(blob)
  const d = createDecipheriv('aes-256-gcm', key, b.subarray(0, 12))
  d.setAuthTag(b.subarray(12, 28))
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8')
}
