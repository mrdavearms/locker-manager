import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { nodeFs, type FsPort } from '../../src/main/file/fsPort'
import { Preferences } from '../../src/main/prefs/preferences'
import { tempDir } from './file/tmp'

describe('Preferences (this computer only)', () => {
  it('start empty and remember the operator', async () => {
    const dir = tempDir()
    const p = new Preferences(dir)
    expect((await p.load()).operatorName).toBeNull()
    await p.update((x) => ({ ...x, operatorName: 'Hannah' }))
    const again = new Preferences(dir)
    expect((await again.load()).operatorName).toBe('Hannah')
  })

  it('keep the eight most recent files, newest first, without repeats', async () => {
    const p = new Preferences(tempDir())
    await p.load()
    for (let i = 0; i < 10; i++)
      await p.rememberRecent(`/f${i}.lockers`, `S${i}`, new Date(2026, 9, 6, 9, i))
    await p.rememberRecent('/f5.lockers', 'S5', new Date(2026, 9, 6, 10))
    const recent = p.get().recentFiles.map((r) => r.path)
    expect(recent).toHaveLength(8)
    expect(recent[0]).toBe('/f5.lockers')
    expect(new Set(recent).size).toBe(8)
  })

  it('remember the welcome tour and hidden getting-started lists; older files read as not seen', async () => {
    const dir = tempDir()
    writeFileSync(
      join(dir, 'preferences.json'),
      JSON.stringify({ version: 1, operatorName: 'Hannah' })
    )
    const p = new Preferences(dir)
    const before = await p.load()
    expect(before.tourSeenAt).toBeNull()
    expect(before.checklistHidden).toEqual([])
    await p.update((x) => ({
      ...x,
      tourSeenAt: '2026-10-07T09:00:00.000Z',
      checklistHidden: ['/a.lockers']
    }))
    const again = await new Preferences(dir).load()
    expect(again.tourSeenAt).toBe('2026-10-07T09:00:00.000Z')
    expect(again.checklistHidden).toEqual(['/a.lockers'])
  })

  it('read a missing or odd registration key as none, keeping the operator name', async () => {
    const dir = tempDir()
    writeFileSync(
      join(dir, 'preferences.json'),
      JSON.stringify({ version: 1, operatorName: 'Hannah' })
    )
    expect((await new Preferences(dir).load()).registrationKey).toBeNull()
    writeFileSync(
      join(dir, 'preferences.json'),
      JSON.stringify({ version: 1, operatorName: 'Hannah', registrationKey: 42 })
    )
    const loaded = await new Preferences(dir).load()
    expect(loaded.operatorName).toBe('Hannah')
    expect(loaded.registrationKey).toBeNull()
  })

  it('survive a damaged preferences file by starting fresh', async () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'preferences.json'), '{ not json')
    const p = new Preferences(dir)
    expect((await p.load()).recentFiles).toEqual([])
  })

  it('remember dismissed sync copies per data file', async () => {
    const dir = tempDir()
    const p = new Preferences(dir)
    await p.load()
    await p.ignoreCopy('/share/Locker data.lockers', 'Locker data (1).lockers')
    await p.ignoreCopy('/share/Locker data.lockers', 'Locker data (1).lockers')
    expect(JSON.parse(readFileSync(join(dir, 'preferences.json'), 'utf8')).ignoredCopies).toEqual({
      '/share/Locker data.lockers': ['Locker data (1).lockers']
    })
  })

  // docs/audits/2026-10-20-stability-audit.md, start-up findings F1, F6 and F7.
  it('keep every good field when one field is unexpected', async () => {
    const dir = tempDir()
    writeFileSync(
      join(dir, 'preferences.json'),
      '\uFEFF' +
        JSON.stringify({
          version: 2,
          operatorName: 'Hannah',
          failedStarts: -3,
          recentFiles: [{ path: '/a.lockers', openedAt: '2026-10-01T00:00:00Z' }]
        })
    )
    const p = await new Preferences(dir).load()
    expect(p.operatorName).toBe('Hannah')
    expect(p.recentFiles.map((r) => r.path)).toEqual(['/a.lockers'])
    expect(p.failedStarts).toBe(0)
  })

  it('write one at a time, so the newest settings are the ones on disk', async () => {
    const dir = tempDir()
    const p = new Preferences(dir)
    await p.load()
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => p.update((x) => ({ ...x, operatorName: `P${i}` })))
    )
    expect(JSON.parse(readFileSync(join(dir, 'preferences.json'), 'utf8')).operatorName).toBe('P19')
  })

  it('retry a rename that another program holds up, and recover from a write that fails', async () => {
    const dir = tempDir()
    let held = 3
    const fs: FsPort = {
      ...nodeFs,
      rename: async (from, to) => {
        if (held-- > 0) throw Object.assign(new Error('busy'), { code: 'EBUSY' })
        await nodeFs.rename(from, to)
      }
    }
    const p = new Preferences(dir, fs)
    await p.load()
    await p.update((x) => ({ ...x, operatorName: 'Hannah' }))
    expect((await new Preferences(dir).load()).operatorName).toBe('Hannah')

    let full = true
    const fullDisk: FsPort = {
      ...nodeFs,
      writeNewFileDurable: async (path, data) => {
        if (full) throw Object.assign(new Error('no space'), { code: 'ENOSPC' })
        await nodeFs.writeNewFileDurable(path, data)
      }
    }
    const q = new Preferences(dir, fullDisk)
    await q.load()
    await expect(q.update((x) => ({ ...x, operatorName: 'Sam' }))).rejects.toThrow(/no space/)
    full = false
    await q.update((x) => ({ ...x, printerNudge: 'up' }))
    const again = await new Preferences(dir).load()
    expect(again.operatorName).toBe('Sam')
    expect(again.printerNudge).toBe('up')
  })
})
