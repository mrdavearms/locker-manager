export interface StudentView {
  id: string
  externalId: string
  firstName: string
  lastName: string
  preferredName: string | null
  /** Preferred name (or first name) and last name, as shown everywhere. */
  displayName: string
  firstNameRaw: string
  lastNameRaw: string
  nameOverride: boolean
  nameCheck: string[]
  yearLevel: string | null
  groupCode: string | null
  groupDisplay: string | null
  house: string | null
  needsAccessible: boolean
  active: boolean
  leftAt: string | null
  notInImportSince: string | null
  locker: { id: string; number: string } | null
  excludedReason: string | null
}

export type StudentFilter =
  'current' | 'possible_leavers' | 'name_check' | 'no_locker' | 'left' | 'all'

export interface StudentCounts {
  current: number
  possibleLeavers: number
  nameCheck: number
  noLocker: number
  left: number
}

export interface ExclusionView {
  id: string
  kind: 'student' | 'group' | 'year_level'
  value: string
  reason: string
  /** For a student exclusion, the student's name if known. */
  label: string
}

export interface GroupView {
  code: string
  display: string
  yearLevel: string | null
  students: number
  sortLast: boolean
  excluded: boolean
}
