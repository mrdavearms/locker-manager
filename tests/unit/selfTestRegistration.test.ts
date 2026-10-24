import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { checkProductionKey } from '../../src/main/registration/registration'

function spki(type: 'ed25519' | 'rsa'): string {
  const { publicKey } =
    type === 'ed25519'
      ? generateKeyPairSync('ed25519')
      : generateKeyPairSync('rsa', { modulusLength: 2048 })
  return publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
}

describe('checkProductionKey', () => {
  it('fails when no key is set', () => {
    expect(() => checkProductionKey(null)).toThrow(/no registration key/i)
  })
  it('fails for text that is not a public key', () => {
    expect(() => checkProductionKey('abc')).toThrow(/does not parse/i)
  })
  it('fails for a key of the wrong kind', () => {
    expect(() => checkProductionKey(spki('rsa'))).toThrow(/Ed25519/)
  })
  it('passes for an Ed25519 public key', () => {
    expect(() => checkProductionKey(spki('ed25519'))).not.toThrow()
  })
})
