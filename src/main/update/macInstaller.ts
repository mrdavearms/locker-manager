import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream, rmSync } from 'node:fs'
import { access, constants, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { app, net } from 'electron'
import log from 'electron-log/main'
import { macAppBundlePath } from '../signing'
import { macInstallScript } from './macInstallScript'

// Installs an update on an unsigned Mac without Squirrel.Mac, which refuses any
// update whose signature differs from the running app (every ad-hoc build does).
//
// 1. Download the release's ZIP with Electron's network stack (follows the
//    system proxy, SPEC.md 9.4) and check its SHA-512 against latest-mac.yml.
// 2. Unpack it with ditto and check the new app: same bundle identifier, the
//    expected version, and an intact code signature.
// 3. After the app quits, a small shell script copies the new app beside the
//    old one, swaps them with two renames, and opens the new one. If any step
//    fails it puts the old app back and opens that instead.
//
// A file this app downloads for itself carries no quarantine flag, so macOS
// does not show the "downloaded from the internet" warning again.

const STAGING = 'pending-update'
const RESULT = 'update-result.json'

export interface MacResult {
  ok: boolean
  version: string
  message: string
}

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 120_000 }, (error, stdout, stderr) => {
      if (error) reject(new Error(`${cmd} failed: ${String(stderr || error.message).trim()}`))
      else resolve(stdout)
    })
  })
}

async function plistValue(appPath: string, key: string): Promise<string> {
  const out = await run('/usr/bin/plutil', [
    '-extract',
    key,
    'raw',
    join(appPath, 'Contents', 'Info.plist')
  ])
  return out.trim()
}

/** The running app's bundle, for example /Applications/Locker Manager.app. */
export function runningBundle(): string {
  return macAppBundlePath(process.execPath)
}

/** Whether this account may rename the app bundle in its folder. */
export async function bundleWritable(bundle: string): Promise<boolean> {
  try {
    await access(dirname(bundle), constants.W_OK)
    await access(bundle, constants.W_OK)
    return true
  } catch {
    return false
  }
}

function stagingDir(): string {
  return join(app.getPath('userData'), STAGING)
}

/**
 * Downloads, checks and unpacks the new version. Resolves the path of the
 * checked app, ready for `installMacUpdate`. Throws a plain message on failure.
 */
export async function prepareMacUpdate(input: {
  url: string
  sha512: string
  version: string
  onProgress: (percent: number) => void
}): Promise<string> {
  const dir = stagingDir()
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  const zip = join(dir, 'update.zip')

  log.info(`mac update: downloading ${input.url}`)
  const response = await net.fetch(input.url)
  if (!response.ok || !response.body) {
    throw new Error(`The download failed (HTTP ${response.status}).`)
  }
  const total = Number(response.headers.get('content-length') ?? 0)
  const hash = createHash('sha512')
  let received = 0
  let lastPercent = -1
  const meter = new Transform({
    transform(chunk: Buffer, _enc, done) {
      hash.update(chunk)
      received += chunk.length
      if (total > 0) {
        const percent = Math.min(100, Math.floor((received / total) * 100))
        if (percent !== lastPercent) {
          lastPercent = percent
          input.onProgress(percent)
        }
      }
      done(null, chunk)
    }
  })
  await pipeline(
    Readable.fromWeb(response.body as import('node:stream/web').ReadableStream),
    meter,
    createWriteStream(zip)
  )
  if (hash.digest('base64') !== input.sha512) {
    throw new Error('The download did not match the release, so it was not installed.')
  }

  const unpacked = join(dir, 'app')
  await run('/usr/bin/ditto', ['-x', '-k', zip, unpacked])
  await rm(zip, { force: true })
  const name = (await readdir(unpacked)).find((n) => n.endsWith('.app'))
  if (!name) throw new Error('The download held no app.')
  const newApp = join(unpacked, name)

  const [newId, ownId, newVersion] = await Promise.all([
    plistValue(newApp, 'CFBundleIdentifier'),
    plistValue(runningBundle(), 'CFBundleIdentifier'),
    plistValue(newApp, 'CFBundleShortVersionString')
  ])
  if (newId !== ownId) throw new Error('The download was not Locker Manager.')
  if (newVersion !== input.version) {
    throw new Error(`The download was version ${newVersion}, not ${input.version}.`)
  }
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', newApp])
  // Written now so the install can start synchronously while the app quits.
  await writeFile(join(dir, 'install.sh'), macInstallScript, { mode: 0o755 })
  log.info(`mac update: ${input.version} downloaded and checked`)
  return newApp
}

/**
 * Starts the swap script and returns at once; the caller then quits the app. The
 * script waits for this process to end before touching anything. Synchronous so
 * it can run inside the app's quit event.
 */
export function installMacUpdate(input: {
  newApp: string
  version: string
  relaunch: boolean
}): void {
  const resultFile = join(app.getPath('userData'), RESULT)
  rmSync(resultFile, { force: true })
  const child = spawn(
    '/bin/bash',
    [
      join(stagingDir(), 'install.sh'),
      String(process.pid),
      runningBundle(),
      input.newApp,
      input.relaunch ? '1' : '0',
      resultFile,
      input.version
    ],
    { detached: true, stdio: 'ignore' }
  )
  child.unref()
  log.info(`mac update: installer started for ${input.version}, relaunch=${input.relaunch}`)
}

/**
 * What the last install did, read once at start. A success is cleared; a
 * failure is kept so the same version is not downloaded and tried again on
 * every start, while a newer one still is.
 */
export async function readLastMacResult(): Promise<MacResult | null> {
  const file = join(app.getPath('userData'), RESULT)
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as MacResult
    if (parsed.ok) {
      await rm(file, { force: true })
      await rm(stagingDir(), { recursive: true, force: true })
    }
    return parsed
  } catch {
    return null
  }
}
