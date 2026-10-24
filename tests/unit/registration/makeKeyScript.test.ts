import { spawnSync } from 'node:child_process'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { checkKey } from '../../../src/main/registration/keyFormat'

const dir = mkdtempSync(join(tmpdir(), 'lm-makekey-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const keyFile = join(dir, 'test-key.pem') // SYNTHETIC key made for this test only
writeFileSync(keyFile, privateKey.export({ format: 'pem', type: 'pkcs8' }))

function run(...args: string[]) {
  return spawnSync(process.execPath, ['scripts/registration-make-key.mjs', ...args], {
    encoding: 'utf8'
  })
}

describe('registration-make-key script', () => {
  it('prints a key that checks out against the matching public key', () => {
    const r = run(
      '--dry-run',
      '--key-file',
      keyFile,
      '--school',
      'Test Primary School',
      '--name',
      'Pat Example',
      '--email',
      'pat@example.test',
      '--expires',
      '2030-12-31'
    )
    expect(r.status).toBe(0)
    const check = checkKey(r.stdout.trim(), [publicKey], new Date('2026-10-25T00:00:00Z'))
    expect(check.ok).toBe(true)
    if (check.ok) {
      expect(check.details.school).toBe('Test Primary School')
      expect(check.details.expires).toBe('2030-12-31')
    }
  })

  it('refuses missing or bad arguments and prints the usage line', () => {
    for (const args of [
      ['--dry-run', '--key-file', keyFile, '--school', 'S', '--name', 'N'],
      ['--dry-run', '--key-file', keyFile, '--school', 'S', '--name', 'N', '--email', 'nope'],
      [
        '--dry-run',
        '--key-file',
        keyFile,
        '--school',
        'S',
        '--name',
        'N',
        '--email',
        'a@b.co',
        '--expires',
        '2030-02-30'
      ]
    ]) {
      const r = run(...args)
      expect(r.status).toBe(1)
      expect(r.stderr).toContain('Usage: npm run registration:make-key')
    }
  })
})
