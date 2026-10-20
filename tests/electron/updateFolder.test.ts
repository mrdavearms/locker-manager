import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createPackage } from '@electron/asar'
import { build } from 'esbuild'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Runs the update folder code inside a real Electron main process. Electron's fs
// treats a .asar file as a folder, so an async recursive rm of a downloaded app
// fails with ENOTEMPTY. Node's fs has no such patch, which is why the unit tests
// passed while 0.11.0 to 0.11.3 Macs stopped updating. Only a real asar archive
// triggers it: Electron reads a file with a bad header as an ordinary file.
// Run with `npm run test:electron` (CI runs it on Windows and Mac).

const electronBinary = createRequire(import.meta.url)('electron') as unknown as string
const RESOURCES = join('app', 'Locker Manager.app', 'Contents', 'Resources')

let work: string
let userData: string
let report: Record<string, unknown>

/** A folder shaped like a Mac's leftover download, with a real asar archive inside. */
async function plantLeftover(root: string): Promise<void> {
  const source = join(work, 'asar-source')
  mkdirSync(source, { recursive: true })
  writeFileSync(join(source, 'index.js'), '// SYNTHETIC')
  mkdirSync(join(root, RESOURCES), { recursive: true })
  await createPackage(source, join(root, RESOURCES, 'app.asar'))
  writeFileSync(join(root, 'install.sh'), '# SYNTHETIC')
}

beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), 'lm-update-folder-'))
  userData = join(work, 'userData')
  for (const name of ['control', 'async', 'sync', 'staging']) await plantLeftover(join(work, name))
  await plantLeftover(join(userData, 'pending-update'))
  writeFileSync(
    join(userData, 'update-result.json'),
    JSON.stringify({ ok: true, version: '9.9.9', message: 'SYNTHETIC' })
  )

  // Inside the project, so Electron finds electron-log in node_modules.
  const script = resolve('node_modules/.cache/locker-manager-electron-tests/updateFolder.cjs')
  await build({
    entryPoints: [resolve('tests/electron/updateFolder.main.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['electron', 'electron-log', 'original-fs'],
    outfile: script,
    logLevel: 'silent'
  })

  const env: NodeJS.ProcessEnv = { ...process.env, LOCKER_MANAGER_BACKGROUND: '1' }
  delete env.ELECTRON_RUN_AS_NODE
  const stdout = await new Promise<string>((done, fail) => {
    execFile(
      electronBinary,
      [script, `--user-data-dir=${userData}`, work],
      { env, timeout: 60_000 },
      (error, out) => (error ? fail(error) : done(out))
    )
  })
  const line = stdout.split(/\r?\n/).find((l) => l.startsWith('REPORT '))
  if (!line) throw new Error(`Electron printed no report:\n${stdout}`)
  report = JSON.parse(line.slice('REPORT '.length)) as Record<string, unknown>
}, 120_000)

afterAll(() => {
  rmSync(work, { recursive: true, force: true })
})

describe('update folders inside Electron', () => {
  it('ran in the main process', () => {
    expect(report).not.toHaveProperty('crashed')
    expect(report.processType).toBe('browser')
  })

  // If this ever passes, Electron has changed and the test no longer proves anything.
  it('still sees the 0.11.0 fault with a plain rm', () => {
    expect(report.control).toMatchObject({ ok: false })
    expect(existsSync(join(work, 'control', RESOURCES, 'app.asar'))).toBe(true)
  })

  it('removeTree clears a leftover download', () => {
    expect(report.removeTree).toEqual({ ok: true })
    expect(existsSync(join(work, 'async'))).toBe(false)
  })

  it('removeTreeSync clears a leftover download', () => {
    expect(report.removeTreeSync).toEqual({ ok: true })
    expect(existsSync(join(work, 'sync'))).toBe(false)
  })

  it('freshStagingDir clears the leftover and gives an empty folder', () => {
    const result = report.freshStagingDir as {
      ok: boolean
      staged: string
      notes: string[]
      rootHolds: string[]
    }
    expect(result.ok).toBe(true)
    expect(result.notes).toEqual([])
    expect(dirname(result.staged)).toBe(join(work, 'staging'))
    expect(readdirSync(join(work, 'staging'))).toEqual([result.rootHolds[0]])
    expect(readdirSync(result.staged)).toEqual([])
  })

  it('a finished install clears pending-update at the next start', () => {
    expect(report.readLastMacResult).toMatchObject({ ok: true, version: '9.9.9' })
    expect(existsSync(join(userData, 'update-result.json'))).toBe(false)
    expect(existsSync(join(userData, 'pending-update'))).toBe(false)
  })
})
