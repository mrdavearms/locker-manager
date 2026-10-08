import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { macInstallScript } from '../../../src/main/update/macInstallScript'

// Runs the real swap script against dummy app folders. ditto and xattr are
// macOS tools, so this only runs on a Mac (CI runs it on the Mac runner).
const onMac = process.platform === 'darwin'

let root = ''
afterEach(() => {
  if (!root) return
  chmodSync(join(root, 'Applications'), 0o755)
  rmSync(root, { recursive: true, force: true })
  root = ''
})

function setUp(): { target: string; newApp: string; result: string; script: string } {
  root = mkdtempSync(join(tmpdir(), 'lm-mac-install-'))
  const target = join(root, 'Applications', 'Locker Manager.app')
  const newApp = join(root, 'staging', 'Locker Manager.app')
  for (const [app, v] of [
    [target, '1.0.0'],
    [newApp, '1.1.0']
  ] as const) {
    mkdirSync(join(app, 'Contents'), { recursive: true })
    writeFileSync(join(app, 'Contents', 'version.txt'), v)
  }
  const script = join(root, 'install.sh')
  writeFileSync(script, macInstallScript, { mode: 0o755 })
  return { target, newApp, result: join(root, 'result.json'), script }
}

function run(s: ReturnType<typeof setUp>, pid: number): void {
  execFileSync('/bin/bash', [s.script, String(pid), s.target, s.newApp, '0', s.result, '1.1.0'], {
    timeout: 20_000
  })
}

describe.skipIf(!onMac)('Mac install script', () => {
  it('waits for the app to quit, then puts the new version in place', () => {
    const s = setUp()
    // Started through a shell that exits at once, so the system (not this test)
    // cleans the process up when it ends, as it does for the real app.
    const pid = Number(
      execFileSync('/bin/bash', ['-c', '/bin/sleep 1 >/dev/null 2>&1 & echo $!'], {
        encoding: 'utf8'
      }).trim()
    )
    const started = Date.now()
    run(s, pid)
    expect(Date.now() - started).toBeGreaterThanOrEqual(800)
    expect(readFileSync(join(s.target, 'Contents', 'version.txt'), 'utf8')).toBe('1.1.0')
    expect(JSON.parse(readFileSync(s.result, 'utf8'))).toEqual({
      ok: true,
      version: '1.1.0',
      message: 'installed'
    })
    expect(existsSync(join(root, 'Applications', '.Locker Manager.app.previous'))).toBe(false)
    expect(existsSync(join(root, 'Applications', '.Locker Manager.app.updating'))).toBe(false)
  })

  it('keeps the old version and says why when the folder cannot be changed', () => {
    const s = setUp()
    chmodSync(join(root, 'Applications'), 0o555)
    try {
      run(s, 999_999)
    } catch {
      // The script exits 1 on failure; the result file says why.
    }
    expect(readFileSync(join(s.target, 'Contents', 'version.txt'), 'utf8')).toBe('1.0.0')
    const result = JSON.parse(readFileSync(s.result, 'utf8')) as { ok: boolean; message: string }
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/could not be copied/)
  })
})
