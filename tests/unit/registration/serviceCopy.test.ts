import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The registration service signs keys and checks forms with copies of the app's own
// files. If this fails, run `npm run registration:sync-key-format` and commit the copies.
const copies = [
  ['src/main/registration/keyFormat.ts', 'registration-service/src/copied/keyFormat.ts'],
  ['src/shared/registration.ts', 'registration-service/src/copied/registration.ts']
] as const

describe('registration service copies', () => {
  it.each(copies)('%s matches the service copy', (from, to) => {
    const expected = readFileSync(from, 'utf8').replaceAll(
      "'@shared/registration'",
      "'./registration'"
    )
    expect(readFileSync(to, 'utf8')).toBe(expected)
  })
})
