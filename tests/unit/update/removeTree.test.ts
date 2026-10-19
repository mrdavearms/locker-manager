import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPackage } from '@electron/asar'
import { build } from 'esbuild'
import { afterAll, beforeAll, expect, it } from 'vitest'

// Electron's fs treats any .asar file as a folder, so a recursive rm cannot
// remove a downloaded app's Resources folder. On 0.11.x Macs that left
// pending-update behind and every later update check failed with ENOTEMPTY.
// The bug only exists inside Electron, so this runs the code there.

const electronBinary = createRequire(import.meta.url)('electron') as unknown as string
let work: string
let script: string

beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), 'lm-remove-tree-'))
  script = join(work, 'run.cjs')
  await build({
    stdin: {
      contents: `require('./src/main/update/removeTree').removeTree(process.argv[2])
        .then(() => console.log('ok'), (e) => { console.log(e.code); process.exit(1) })`,
      resolveDir: process.cwd(),
      loader: 'ts'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['original-fs'],
    outfile: script,
    logLevel: 'silent'
  })
})

afterAll(() => {
  rmSync(work, { recursive: true, force: true })
})

it('removes a folder that holds an app.asar', async () => {
  const source = join(work, 'source')
  mkdirSync(source)
  writeFileSync(join(source, 'index.js'), 'SYNTHETIC')
  const staging = join(work, 'pending-update', 'app', 'Locker Manager.app', 'Contents', 'Resources')
  mkdirSync(staging, { recursive: true })
  await createPackage(source, join(staging, 'app.asar'))

  const target = join(work, 'pending-update')
  const out = execFileSync(electronBinary, [script, target], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8'
  })
  expect(out.trim()).toBe('ok')
  expect(existsSync(target)).toBe(false)
})
