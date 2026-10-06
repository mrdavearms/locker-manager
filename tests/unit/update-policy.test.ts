import { describe, expect, it } from 'vitest'
import {
  allowPrerelease,
  installBlockedReason,
  isDeveloperIdSigned,
  isNewer,
  releasePageUrl,
  updateMode
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
