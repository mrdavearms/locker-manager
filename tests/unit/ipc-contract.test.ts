import { describe, expect, it } from 'vitest'
import { isAllowedExternalUrl } from '../../src/shared/externalUrls'
import { AppInfoSchema, OpenExternalSchema, UpdateStatusSchema } from '../../src/shared/ipc'

describe('external URL allow-list', () => {
  it('opens only the project pages on GitHub over https', () => {
    expect(isAllowedExternalUrl('https://github.com/mrdavearms/locker-manager')).toBe(true)
    expect(
      isAllowedExternalUrl('https://github.com/mrdavearms/locker-manager/releases/tag/v0.0.2')
    ).toBe(true)
  })
  it('refuses everything else', () => {
    expect(isAllowedExternalUrl('http://github.com/mrdavearms/locker-manager')).toBe(false)
    expect(isAllowedExternalUrl('https://github.com/someone-else/locker-manager')).toBe(false)
    expect(isAllowedExternalUrl('https://github.com/mrdavearms/locker-manager.evil.com/x')).toBe(
      false
    )
    expect(isAllowedExternalUrl('file:///etc/passwd')).toBe(false)
    expect(isAllowedExternalUrl('not a url')).toBe(false)
  })
})

describe('IPC schemas', () => {
  it('validates app info', () => {
    const ok = AppInfoSchema.safeParse({
      name: 'Locker Manager',
      version: '0.0.1',
      platform: 'win32',
      arch: 'x64',
      packaged: true,
      signed: false,
      electron: '44.0.0',
      chromium: '140.0.0.0',
      node: '22.0.0',
      licence: 'MIT',
      repoUrl: 'https://github.com/mrdavearms/locker-manager',
      releasesUrl: 'https://github.com/mrdavearms/locker-manager/releases'
    })
    expect(ok.success).toBe(true)
  })
  it('rejects an update status with an impossible percentage', () => {
    const bad = UpdateStatusSchema.safeParse({
      state: 'downloading',
      mode: 'auto',
      version: '0.0.2',
      percent: 140
    })
    expect(bad.success).toBe(false)
  })
  it('requires a download page on an available update', () => {
    const bad = UpdateStatusSchema.safeParse({
      state: 'available',
      mode: 'manual-download',
      version: '0.0.2'
    })
    expect(bad.success).toBe(false)
  })
  it('rejects a non-url for openExternal', () => {
    expect(OpenExternalSchema.safeParse({ url: 'github' }).success).toBe(false)
  })
})
