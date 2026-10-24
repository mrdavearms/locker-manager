import { generateKeyPairSync, type KeyObject } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { signKey } from '../../../src/main/registration/keyFormat'
import { keysAfterOpen, registrationStatus } from '../../../src/main/registration/policy'
import type { RegistrationDetails } from '../../../src/shared/registration'

let priv: KeyObject
let pub: KeyObject
let otherPriv: KeyObject
const now = new Date(2026, 10, 3)

const base: RegistrationDetails = {
  v: 1,
  id: 'R-00012',
  school: 'Example Secondary College',
  name: 'Hannah Smith',
  email: 'hsmith@example.vic.edu.au',
  issued: '2026-11-02',
  plan: 'free',
  expires: null
}

let good: (id: string) => string
let bad: string
let expired: string

beforeAll(() => {
  const pair = generateKeyPairSync('ed25519')
  priv = pair.privateKey
  pub = pair.publicKey
  otherPriv = generateKeyPairSync('ed25519').privateKey
  good = (id) => signKey({ ...base, id }, priv)
  bad = signKey(base, otherPriv)
  expired = signKey({ ...base, expires: '2026-01-01' }, priv)
})

const input = (o: Partial<Parameters<typeof registrationStatus>[0]>) => ({
  computerKey: null,
  itKey: null,
  fileKey: null,
  publicKeys: [pub],
  now,
  ...o
})

describe('registrationStatus', () => {
  it('registers from a valid computer key', () => {
    const s = registrationStatus(input({ computerKey: good('A') }))
    expect(s).toMatchObject({ state: 'registered', source: 'computer' })
    if (s.state === 'registered') expect(s.details.id).toBe('A')
  })

  it('falls back to the file key when the IT key is invalid', () => {
    const s = registrationStatus(input({ itKey: bad, fileKey: good('F') }))
    expect(s).toMatchObject({ state: 'registered', source: 'file' })
  })

  it('prefers the IT key over the computer key', () => {
    const s = registrationStatus(input({ itKey: good('I'), computerKey: good('C') }))
    expect(s).toMatchObject({ state: 'registered', source: 'it' })
  })

  it('is unregistered with no key, and with only an expired key', () => {
    expect(registrationStatus(input({}))).toEqual({ state: 'unregistered' })
    expect(registrationStatus(input({ computerKey: expired }))).toEqual({ state: 'unregistered' })
  })

  it('stores the cleaned key text', () => {
    const k = good('A')
    const s = registrationStatus(input({ computerKey: ` ${k.slice(0, 20)}\n${k.slice(20)} ` }))
    expect(s).toMatchObject({ state: 'registered', key: k })
  })

  it('never expires a key with no end date, whatever the clock says', () => {
    const k = good('A')
    for (const when of [new Date(2100, 0, 1), new Date(2000, 0, 1)]) {
      expect(registrationStatus(input({ computerKey: k, now: when })).state).toBe('registered')
    }
  })
})

describe('keysAfterOpen', () => {
  const open = (o: Partial<Parameters<typeof keysAfterOpen>[0]>) =>
    keysAfterOpen({
      fileKey: null,
      computerKey: null,
      itKey: null,
      mode: 'edit',
      publicKeys: [pub],
      now,
      ...o
    })

  it('saves a valid file key to a computer that has none', () => {
    const k = good('F')
    expect(open({ fileKey: k })).toEqual({ saveToComputer: k, writeToFile: null })
  })

  it('writes the computer key to a file that has none, in edit mode', () => {
    const k = good('C')
    expect(open({ computerKey: k })).toEqual({ saveToComputer: null, writeToFile: k })
  })

  it('writes nothing to the file in read-only mode', () => {
    expect(open({ computerKey: good('C'), mode: 'read_only' })).toEqual({
      saveToComputer: null,
      writeToFile: null
    })
  })

  it('uses the IT key for the file when the computer has no valid key', () => {
    const k = good('I')
    expect(open({ itKey: k }).writeToFile).toBe(k)
  })

  it('never replaces a valid key', () => {
    expect(open({ fileKey: good('A'), computerKey: good('B') })).toEqual({
      saveToComputer: null,
      writeToFile: null
    })
  })

  it('replaces an invalid file key with the computer key', () => {
    const k = good('C')
    expect(open({ fileKey: bad, computerKey: k }).writeToFile).toBe(k)
  })
})
