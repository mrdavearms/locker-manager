import { generateKeyPairSync, type KeyObject } from 'node:crypto'
import fc from 'fast-check'
import { beforeAll, describe, expect, it } from 'vitest'
import { checkKey, signKey } from '../../../src/main/registration/keyFormat'
import type { RegistrationDetails } from '../../../src/shared/registration'

let priv: KeyObject
let pub: KeyObject
const now = new Date(2026, 10, 3)

const d: RegistrationDetails = {
  v: 1,
  id: 'R-00012',
  school: 'Example Secondary College',
  name: 'Hannah Smith',
  email: 'hsmith@example.vic.edu.au',
  issued: '2026-11-02',
  plan: 'free',
  expires: null
}

beforeAll(() => {
  const pair = generateKeyPairSync('ed25519')
  priv = pair.privateKey
  pub = pair.publicKey
})

describe('registration key format', () => {
  it('round-trips the details', () => {
    expect(checkKey(signKey(d, priv), [pub], now)).toEqual({ ok: true, details: d })
  })

  it('starts with LM1. and is under 400 characters', () => {
    const key = signKey(d, priv)
    expect(key.startsWith('LM1.')).toBe(true)
    expect(key.length).toBeLessThan(400)
  })

  it('accepts a key pasted with line breaks and odd spaces', () => {
    const key = signKey(d, priv)
    const wrapped = key.match(/.{1,60}/g)!.join('\n')
    expect(checkKey('\t' + wrapped + ' ' + String.fromCharCode(0x200b), [pub], now).ok).toBe(true)
  })

  it('refuses a changed school name', () => {
    const [, body = '', sig = ''] = signKey(d, priv).split('.')
    const changed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    changed.school = 'Another School'
    const forged = `LM1.${Buffer.from(JSON.stringify(changed)).toString('base64url')}.${sig}`
    expect(checkKey(forged, [pub], now)).toEqual({ ok: false, reason: 'bad_signature' })
  })

  it('refuses a key signed by another key pair', () => {
    const other = generateKeyPairSync('ed25519')
    expect(checkKey(signKey(d, other.privateKey), [pub], now)).toEqual({
      ok: false,
      reason: 'bad_signature'
    })
  })

  it('accepts a signature from any listed key', () => {
    const other = generateKeyPairSync('ed25519')
    expect(checkKey(signKey(d, priv), [other.publicKey, pub], now).ok).toBe(true)
  })

  it('refuses rubbish', () => {
    const lm2 = signKey(d, priv).replace('LM1.', 'LM2.')
    for (const text of ['', 'LM1.', 'LM1.abc', 'hello', lm2]) {
      expect(checkKey(text, [pub], now)).toEqual({ ok: false, reason: 'malformed' })
    }
  })

  it('refuses version 2', () => {
    const v2 = signKey({ ...d, v: 2 } as unknown as RegistrationDetails, priv)
    expect(checkKey(v2, [pub], now)).toEqual({ ok: false, reason: 'unknown_version' })
  })

  it('refuses extra fields', () => {
    const extra = signKey({ ...d, admin: true } as unknown as RegistrationDetails, priv)
    expect(checkKey(extra, [pub], now)).toEqual({ ok: false, reason: 'malformed' })
  })

  it('expires at the end of the stated date, local time', () => {
    const key = signKey({ ...d, expires: '2027-03-31' }, priv)
    expect(checkKey(key, [pub], new Date(2027, 2, 31, 23, 0)).ok).toBe(true)
    expect(checkKey(key, [pub], new Date(2027, 3, 1, 0, 1))).toEqual({
      ok: false,
      reason: 'expired'
    })
  })

  it('round-trips any text and rejects any single-character change to the signature', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fc.string(), fc.nat(), (school, name, email, at) => {
        const details = { ...d, school, name, email }
        const key = signKey(details, priv)
        expect(checkKey(key, [pub], now)).toEqual({ ok: true, details })
        const dot = key.lastIndexOf('.')
        const i = dot + 1 + (at % (key.length - dot - 1))
        const flipped = key[i] === 'A' ? 'B' : 'A'
        const bad = key.slice(0, i) + flipped + key.slice(i + 1)
        expect(checkKey(bad, [pub], now).ok).toBe(false)
      }),
      { numRuns: 100 }
    )
  })
})
