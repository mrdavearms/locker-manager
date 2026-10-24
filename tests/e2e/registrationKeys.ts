import { generateKeyPairSync, sign } from 'node:crypto'

// A key pair made when the tests start. The app is given the public half
// (LOCKER_MANAGER_REG_TEST_PUBKEY), so these keys are accepted by a development copy
// and by nothing else. Signing is the same as src/main/registration/keyFormat.ts:
// LM1. + base64url(JSON) + . + base64url(Ed25519 signature over the ASCII body).

const pair = generateKeyPairSync('ed25519')

/** Base64 SPKI DER of the test public key. */
export function testPublicKey(): string {
  return pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
}

export interface KeyDetails {
  v: 1
  id: string
  school: string
  name: string
  email: string
  issued: string
  plan: 'free'
  expires: string | null
}

export function makeKey(partial: Partial<KeyDetails> = {}): string {
  const details: KeyDetails = {
    v: 1,
    id: 'R-00001',
    school: 'Example Secondary College',
    name: 'Sam Example',
    email: 'sam@example.edu.au',
    issued: '2026-10-01',
    plan: 'free',
    expires: null,
    ...partial
  }
  const body = Buffer.from(JSON.stringify(details), 'utf8').toString('base64url')
  const signature = sign(null, Buffer.from(body, 'ascii'), pair.privateKey).toString('base64url')
  return `LM1.${body}.${signature}`
}
