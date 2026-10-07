import type { Screen } from './screens'

// Links between the guide (docs/user-guide.md, by section slug) and the screens.
// tests/unit/markdown.test.ts checks every slug here is a real section.

/** Which screen each task lives on. Sections not listed have no button. */
export const SHOW_ME: Record<string, Screen> = {
  'open-your-school-s-file': 'home',
  'see-your-lockers': 'lockers',
  'add-lockers': 'settings',
  'mark-a-locker-out-of-service-reserve-it-or-change-it': 'lockers',
  'renumber-a-locker': 'lockers',
  'change-the-kind-of-lock': 'settings',
  'set-up-your-school': 'setup',
  'add-your-school-s-logo': 'settings',
  'import-students': 'import',
  'check-names': 'students',
  'possible-leavers': 'students',
  'students-who-never-get-a-locker': 'students',
  'allocate-lockers-for-the-whole-year': 'allocate',
  'lock-codes-and-their-rules': 'settings-codes',
  'locks-to-reset': 'home',
  'undo-a-mistake': 'history',
  'print-locker-labels': 'print',
  'choose-and-measure-your-label-sheets': 'settings-labels',
  'line-up-your-printer-calibration-page': 'settings-labels',
  'change-the-label-layout': 'settings-labels',
  'print-letters': 'letters',
  'change-the-letter': 'settings-letters',
  'add-pictures-to-letters': 'settings-letters',
  'letters-in-other-languages': 'settings-letters',
  'lists-and-reports': 'reports',
  'export-the-whole-file': 'reports',
  'start-next-year': 'rollover',
  keys: 'lockers',
  'protect-codes-with-a-pin': 'settings-privacy',
  'change-how-long-backups-are-kept': 'settings-storage',
  'text-size-dark-mode-and-high-contrast': 'settings-computer'
}

/** The guide section that helps with each screen: the Guide opens there. */
export const FOR_SCREEN: Record<Screen, string> = {
  home: 'getting-started',
  students: 'check-names',
  import: 'import-students',
  lockers: 'see-your-lockers',
  allocate: 'allocate-lockers-for-the-whole-year',
  print: 'print-locker-labels',
  letters: 'print-letters',
  reports: 'lists-and-reports',
  history: 'undo-a-mistake',
  settings: 'find-a-setting',
  'settings-labels': 'choose-and-measure-your-label-sheets',
  'settings-letters': 'change-the-letter',
  'settings-codes': 'lock-codes-and-their-rules',
  'settings-privacy': 'protect-codes-with-a-pin',
  'settings-storage': 'change-how-long-backups-are-kept',
  'settings-computer': 'text-size-dark-mode-and-high-contrast',
  setup: 'set-up-your-school',
  rollover: 'start-next-year'
}

/** Null (no file open) opens at Getting started. */
export function guideSectionFor(screen: Screen | null): string {
  return screen ? FOR_SCREEN[screen] : 'getting-started'
}
