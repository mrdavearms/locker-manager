import { describe, expect, it } from 'vitest'
import { getBusyState, whileBusy } from '../../src/main/busy'
import {
  allowPrerelease,
  installBlockedReason,
  isDeveloperIdSigned,
  isNewer,
  releasePageUrl,
  updateMode,
  macBlocker,
  macZipFile,
  releaseFileUrl,
  installAtStartup
} from '../../src/main/update/policy'

describe('allowPrerelease', () => {
  it('accepts GitHub pre-releases while the version is below 1.0.0', () => {
    expect(allowPrerelease('0.0.1')).toBe(true)
    expect(allowPrerelease('0.9.12')).toBe(true)
  })
  it('refuses pre-releases from 1.0.0 on', () => {
    expect(allowPrerelease('1.0.0')).toBe(false)
    expect(allowPrerelease('2.3.1')).toBe(false)
  })
  it('follows the beta channel when the running version is itself a beta', () => {
    expect(allowPrerelease('1.3.0-beta.2')).toBe(true)
  })
  it('treats an unparseable version as stable', () => {
    expect(allowPrerelease('not-a-version')).toBe(false)
  })
})

describe('isNewer', () => {
  it('compares semantic versions', () => {
    expect(isNewer('0.0.1', '0.0.2')).toBe(true)
    expect(isNewer('0.0.2', '0.0.1')).toBe(false)
    expect(isNewer('0.0.2', '0.0.2')).toBe(false)
    expect(isNewer('1.0.0', '1.0.1-beta.1')).toBe(true)
  })
  it('never upgrades on garbage', () => {
    expect(isNewer('x', '1.0.0')).toBe(false)
  })
})

describe('isDeveloperIdSigned', () => {
  const adhoc = [
    'Executable=/Applications/Locker Manager.app/Contents/MacOS/Locker Manager',
    'Identifier=au.com.dandsarmstrong.lockermanager',
    'Format=app bundle with Mach-O universal (x86_64 arm64)',
    'CodeDirectory v=20400 size=1234 flags=0x2(adhoc) hashes=30+7 location=embedded',
    'Signature=adhoc',
    'Info.plist entries=30'
  ].join('\n')
  const developerId = [
    'Executable=/Applications/Locker Manager.app/Contents/MacOS/Locker Manager',
    'Identifier=au.com.dandsarmstrong.lockermanager',
    'Signature size=9006',
    'Authority=Developer ID Application: Dave Armstrong (ABCDE12345)',
    'Authority=Developer ID Certification Authority',
    'Authority=Apple Root CA',
    'Timestamp=6 Oct 2026 at 9:12:00 am'
  ].join('\n')

  it('says no for an ad-hoc signature', () => {
    expect(isDeveloperIdSigned(adhoc)).toBe(false)
  })
  it('says yes for a Developer ID signature', () => {
    expect(isDeveloperIdSigned(developerId)).toBe(true)
  })
  it('says no for empty or unrelated output', () => {
    expect(isDeveloperIdSigned('')).toBe(false)
    expect(isDeveloperIdSigned('code object is not signed at all')).toBe(false)
  })
  it('does not accept a Mac App Store or development certificate', () => {
    expect(isDeveloperIdSigned('Authority=Apple Development: Someone (TEAM)')).toBe(false)
  })
})

describe('updateMode', () => {
  it('is disabled in a development build', () => {
    expect(updateMode({ platform: 'darwin', packaged: false, signed: false })).toBe('disabled')
  })
  it('only notifies on an unsigned Mac', () => {
    expect(updateMode({ platform: 'darwin', packaged: true, signed: false })).toBe(
      'manual-download'
    )
  })
  it('installs on a signed Mac', () => {
    expect(updateMode({ platform: 'darwin', packaged: true, signed: true })).toBe('auto')
  })
  it('installs itself on an unsigned Mac that can replace its own app', () => {
    expect(
      updateMode({ platform: 'darwin', packaged: true, signed: false, macBlocker: null })
    ).toBe('auto')
  })
  it('only notifies on an unsigned Mac that cannot replace its own app', () => {
    expect(
      updateMode({ platform: 'darwin', packaged: true, signed: false, macBlocker: 'no' })
    ).toBe('manual-download')
  })
  it('installs on Windows even unsigned', () => {
    expect(updateMode({ platform: 'win32', packaged: true, signed: false })).toBe('auto')
  })
})

describe('releasePageUrl', () => {
  it('points at the tag page for the version', () => {
    expect(releasePageUrl('https://github.com/mrdavearms/locker-manager', '0.0.2')).toBe(
      'https://github.com/mrdavearms/locker-manager/releases/tag/v0.0.2'
    )
    expect(releasePageUrl('https://github.com/mrdavearms/locker-manager/', '0.0.2')).toBe(
      'https://github.com/mrdavearms/locker-manager/releases/tag/v0.0.2'
    )
  })
})

describe('installBlockedReason', () => {
  const idle = { saving: false, printing: false, importing: false, unsavedChanges: false }
  it('allows a restart when nothing is running', () => {
    expect(installBlockedReason(idle)).toBeNull()
  })
  it.each([
    ['saving', 'save'],
    ['printing', 'print'],
    ['importing', 'import'],
    ['unsavedChanges', 'unsaved']
  ] as const)('blocks while %s', (flag, word) => {
    expect(installBlockedReason({ ...idle, [flag]: true })).toMatch(new RegExp(word, 'i'))
  })
})

describe('whileBusy', () => {
  it('marks printing as busy only while the job runs, even when two overlap or one fails', async () => {
    let release!: () => void
    const slow = whileBusy('printing', () => new Promise<void>((r) => (release = r)))
    await expect(whileBusy('printing', () => Promise.reject(new Error('x')))).rejects.toThrow('x')
    expect(getBusyState().printing).toBe(true)
    release()
    await slow
    expect(getBusyState().printing).toBe(false)
  })
})

describe('macBlocker', () => {
  const app = '/Applications/Locker Manager.app'
  it('allows a writable copy in Applications', () => {
    expect(macBlocker(app, true)).toBeNull()
    expect(macBlocker('/Users/kim/Applications/Locker Manager.app', true)).toBeNull()
  })
  it('refuses when the account cannot change Applications', () => {
    expect(macBlocker(app, false)).toMatch(/not allowed to change the Applications folder/)
  })
  it('refuses a copy macOS is running from a translocated folder', () => {
    expect(
      macBlocker('/private/var/folders/x/T/AppTranslocation/ABC/d/Locker Manager.app', true)
    ).toMatch(/drag Locker Manager into Applications/)
  })
  it('refuses a copy running from the disk image', () => {
    expect(macBlocker('/Volumes/Locker Manager 1.0.0/Locker Manager.app', true)).toMatch(
      /disk image/
    )
  })
  it('refuses a path that is not an app bundle', () => {
    expect(macBlocker('/usr/local/bin', true)).not.toBeNull()
  })
})

describe('macZipFile', () => {
  it('picks the universal ZIP over the DMG', () => {
    const files = [
      { url: 'Locker-Manager-1.0.0-universal.dmg' },
      { url: 'Locker-Manager-1.0.0-universal.zip' }
    ]
    expect(macZipFile(files)?.url).toBe('Locker-Manager-1.0.0-universal.zip')
  })
  it('finds nothing when there is no ZIP', () => {
    expect(macZipFile([{ url: 'Locker-Manager-1.0.0-universal.dmg' }])).toBeUndefined()
  })
})

describe('releaseFileUrl', () => {
  it('builds the download address from the file name', () => {
    expect(
      releaseFileUrl(
        'https://github.com/mrdavearms/locker-manager',
        '1.0.0',
        'Locker-Manager-1.0.0-universal.zip'
      )
    ).toBe(
      'https://github.com/mrdavearms/locker-manager/releases/download/v1.0.0/Locker-Manager-1.0.0-universal.zip'
    )
  })
  it('keeps a full address as it is', () => {
    expect(releaseFileUrl('https://github.com/x/y', '1.0.0', 'https://example.org/a.zip')).toBe(
      'https://example.org/a.zip'
    )
  })
})

describe('installAtStartup', () => {
  it('installs when found at start, before any file is opened', () => {
    expect(installAtStartup({ startup: true, fileOpenedSinceLaunch: false, skipped: false })).toBe(
      true
    )
  })
  it('waits once a file has been opened, Skip was pressed, or it is a later check', () => {
    expect(installAtStartup({ startup: true, fileOpenedSinceLaunch: true, skipped: false })).toBe(
      false
    )
    expect(installAtStartup({ startup: true, fileOpenedSinceLaunch: false, skipped: true })).toBe(
      false
    )
    expect(installAtStartup({ startup: false, fileOpenedSinceLaunch: false, skipped: false })).toBe(
      false
    )
  })
})
