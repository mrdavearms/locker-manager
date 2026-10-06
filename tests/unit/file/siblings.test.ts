import { describe, expect, it } from 'vitest'
import {
  findConflictCopies,
  leftoverTempFiles,
  locationWarning
} from '../../../src/main/file/siblings'

describe('findConflictCopies (SPEC.md 6.3)', () => {
  const siblings = [
    'Locker data.lockers',
    'Locker data-OFFICE-PC.lockers',
    'Locker data-Dave’s MacBook Pro.lockers',
    'Locker data (1).lockers',
    'Locker data (2).lockers',
    "Locker data (Dave's conflicted copy 2026-10-06).lockers",
    'Locker data (conflict 2026-10-06).lockers',
    'Locker data copy.lockers',
    'Locker data copy 2.lockers',
    'Locker data.lockers.lock',
    'Locker data.lockers.tmp-abc',
    'Locker data 2027.lockers',
    'Other school.lockers',
    'Locker data-OFFICE-PC.xlsx'
  ]
  it('finds every kind of sync and Finder copy', () => {
    expect(findConflictCopies('Locker data.lockers', siblings)).toEqual(
      [
        'Locker data-OFFICE-PC.lockers',
        'Locker data-Dave’s MacBook Pro.lockers',
        'Locker data (1).lockers',
        'Locker data (2).lockers',
        "Locker data (Dave's conflicted copy 2026-10-06).lockers",
        'Locker data (conflict 2026-10-06).lockers',
        'Locker data copy.lockers',
        'Locker data copy 2.lockers'
      ].sort()
    )
  })
  it('does not flag a differently named file, the lock, or a temporary file', () => {
    const found = findConflictCopies('Locker data.lockers', siblings)
    expect(found).not.toContain('Locker data 2027.lockers')
    expect(found).not.toContain('Locker data.lockers.lock')
    expect(found).not.toContain('Other school.lockers')
  })
  it('copes with names that contain regular-expression characters', () => {
    expect(
      findConflictCopies('Lockers (2026) [main].lockers', ['Lockers (2026) [main] (1).lockers'])
    ).toEqual(['Lockers (2026) [main] (1).lockers'])
  })
})

describe('leftoverTempFiles', () => {
  it('finds interrupted saves and lock writes only', () => {
    expect(
      leftoverTempFiles('Locker data.lockers', [
        'Locker data.lockers',
        'Locker data.lockers.tmp-1a',
        'Locker data.lockers.lock.tmp-9',
        'x.tmp-1'
      ])
    ).toEqual(['Locker data.lockers.tmp-1a', 'Locker data.lockers.lock.tmp-9'])
  })
})

describe('locationWarning (SPEC.md section 15, item 11)', () => {
  const mac = { home: '/Users/hannah', tmpDir: '/var/folders/xy/T', platform: 'darwin' as const }
  const win = {
    home: 'C:\\Users\\hannah',
    tmpDir: 'C:\\Users\\hannah\\AppData\\Local\\Temp',
    platform: 'win32' as const
  }
  it('warns about Downloads, temporary folders and email attachments', () => {
    expect(locationWarning('/Users/hannah/Downloads/Locker data.lockers', mac)).toBe('downloads')
    expect(locationWarning('C:\\Users\\hannah\\Downloads\\Locker data.lockers', win)).toBe(
      'downloads'
    )
    expect(
      locationWarning('C:\\Users\\hannah\\AppData\\Local\\Temp\\x\\Locker data.lockers', win)
    ).toBe('temporary')
    expect(
      locationWarning(
        'C:\\Users\\hannah\\AppData\\Local\\Microsoft\\Windows\\INetCache\\Content.Outlook\\AB12\\Locker data.lockers',
        win
      )
    ).toBe('email_attachment')
    expect(
      locationWarning(
        '/Users/hannah/Library/Containers/com.microsoft.Outlook/Data/tmp/Locker data.lockers',
        mac
      )
    ).toBe('email_attachment')
  })
  it('stays quiet for the shared folder', () => {
    expect(
      locationWarning(
        '/Users/hannah/Library/CloudStorage/OneDrive-DepartmentofEducation/Lockers/Locker data.lockers',
        mac
      )
    ).toBeNull()
    expect(
      locationWarning('C:\\Users\\hannah\\OneDrive - School\\Lockers\\Locker data.lockers', win)
    ).toBeNull()
    expect(locationWarning('\\\\SERVER\\Staff\\Lockers\\Locker data.lockers', win)).toBeNull()
  })
})
