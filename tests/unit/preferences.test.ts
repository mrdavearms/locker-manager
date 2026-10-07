import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
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
})
