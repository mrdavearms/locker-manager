// Year rollover (SPEC.md 4.10).

export interface RolloverStatus {
  currentYear: string | null
  nextYear: string
  started: boolean
  archived: boolean
  promoted: boolean
  /** Students holding a locker now. */
  assignments: number
  /** Locks whose code a student knows. */
  locksWithKnownCodes: number
  /** Locks on 0 0 0 0 with no code. */
  locksOnZero: number
  /** Locks on the "Locks to reset" list. */
  resetsWaiting: number
  /** Letters for new lockers or codes not yet printed; null if no letters were ever printed. */
  lettersNotPrinted: number | null
  /** Code sets for the current school year with codes still ready to use. */
  nextYearCodeSets: number
  studentsWithoutLocker: number
}

export interface SelfResetGroup {
  group: string
  display: string
  locks: { lockId: string; locker: string; student: string }[]
}
