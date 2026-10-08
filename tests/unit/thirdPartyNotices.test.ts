import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromiumLicencesPath, noticesPath } from '../../src/main/notices'
import { hasAuthenticodeSignature } from '../../src/main/peSignature'

// scripts/third-party-notices.mjs writes the licence notices that ship with the app.
// Every package electron-builder puts in the app must be listed, with its version.

const root = resolve('.')
let dir = ''
let text = ''

interface LockEntry {
  dev?: boolean
  devOptional?: boolean
  link?: boolean
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'notices-'))
  const renderer = join(dir, 'renderer-packages.json')
  writeFileSync(renderer, JSON.stringify(['node_modules/react', 'node_modules/lucide-react']))
  const out = join(dir, 'NOTICES.txt')
  execFileSync(
    process.execPath,
    ['scripts/third-party-notices.mjs', '--renderer', renderer, '--out', out],
    { cwd: root }
  )
  text = readFileSync(out, 'utf8')
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

function heading(name: string, version: string): RegExp {
  return new RegExp(
    `^${name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')} ${version.replace(/\./g, '\\.')}$`,
    'm'
  )
}

describe('third-party notices', () => {
  it('lists every production dependency that ships in the app, with its version', () => {
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as {
      packages: Record<string, LockEntry>
    }
    const shipped = Object.entries(lock.packages).filter(
      ([path, info]) =>
        path !== '' &&
        !info.dev &&
        !info.devOptional &&
        !info.link &&
        existsSync(join(path, 'package.json'))
    )
    expect(shipped.length).toBeGreaterThan(50)
    for (const [path] of shipped) {
      const pkg = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')) as {
        name: string
        version: string
      }
      expect(text, `${pkg.name} (${path})`).toMatch(heading(pkg.name, pkg.version))
    }
  })

  it('lists each direct dependency in package.json', () => {
    const app = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dependencies: Record<string, string>
    }
    for (const name of Object.keys(app.dependencies)) {
      expect(text).toMatch(new RegExp(`^${name.replace(/[.]/g, '\\.')} \\d`, 'm'))
    }
  })

  it('lists packages bundled into the window, the fonts, Electron and Chromium', () => {
    expect(text).toMatch(/^react \d/m)
    expect(text).toMatch(/^lucide-react \d/m)
    expect(text).toMatch(/^tailwindcss \d/m)
    expect(text).toMatch(/^Arimo \(labels and letters\)$/m)
    expect(text).toMatch(/^@fontsource\/atkinson-hyperlegible-next \d/m)
    expect(text).toMatch(/^@fontsource-variable\/bricolage-grotesque \d/m)
    expect(text).toMatch(/^@fontsource-variable\/big-shoulders-stencil \d/m)
    expect(text).toMatch(/^Electron \d/m)
    expect(text).toContain('LICENSES.chromium.html')
  })

  it('explains the licence choice for jszip and the package with no stated licence', () => {
    expect(text).toContain('Locker Manager uses it under the MIT licence')
    expect(text).toMatch(/^buffers 0\.1\.1\nLicence: none stated$/m)
  })
})

describe('where the notices live', () => {
  const base = {
    resourcesPath: '/Apps/LM/Contents/Resources',
    execPath: '/Apps/LM/Contents/MacOS/Locker Manager',
    appPath: '/src/lm'
  }
  it('uses the resources folder when packaged, and the build output in development', () => {
    expect(noticesPath({ ...base, packaged: true, platform: 'darwin' })).toBe(
      join(base.resourcesPath, 'THIRD-PARTY-NOTICES.txt')
    )
    expect(noticesPath({ ...base, packaged: false, platform: 'darwin' })).toBe(
      join('/src/lm', 'out', 'notices', 'THIRD-PARTY-NOTICES.txt')
    )
  })
  it("finds Chromium's licences beside the .exe on Windows and in Resources on a Mac", () => {
    expect(chromiumLicencesPath({ ...base, packaged: true, platform: 'darwin' })).toBe(
      join(base.resourcesPath, 'LICENSES.chromium.html')
    )
    expect(
      chromiumLicencesPath({
        ...base,
        packaged: true,
        platform: 'win32',
        execPath: join('/Program Files/Locker Manager', 'Locker Manager.exe')
      })
    ).toBe(join('/Program Files/Locker Manager', 'LICENSES.chromium.html'))
  })
})

describe('Windows signature check', () => {
  function pe(magic: number, certSize: number): Uint8Array {
    const b = new Uint8Array(1024)
    const v = new DataView(b.buffer)
    v.setUint16(0, 0x5a4d, true)
    v.setUint32(0x3c, 0x80, true)
    v.setUint32(0x80, 0x00004550, true)
    const optional = 0x80 + 24
    v.setUint16(optional, magic, true)
    const security = optional + (magic === 0x20b ? 112 : 96) + 32
    if (certSize > 0) {
      v.setUint32(security, 0x9000, true)
      v.setUint32(security + 4, certSize, true)
    }
    return b
  }
  it('sees a certificate table in 64-bit and 32-bit programs', () => {
    expect(hasAuthenticodeSignature(pe(0x20b, 0x2000))).toBe(true)
    expect(hasAuthenticodeSignature(pe(0x10b, 0x2000))).toBe(true)
  })
  it('says unsigned when the table is empty or the file is not a program', () => {
    expect(hasAuthenticodeSignature(pe(0x20b, 0))).toBe(false)
    expect(hasAuthenticodeSignature(new Uint8Array(1024))).toBe(false)
    expect(hasAuthenticodeSignature(pe(0x20b, 0x2000).subarray(0, 100))).toBe(false)
  })
})
