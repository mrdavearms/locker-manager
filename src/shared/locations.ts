import type { LockType } from './locks'

export interface AreaView {
  id: string
  name: string
  description: string | null
  colour: string | null
  sortOrder: number
  defaultYearLevels: string[]
  banks: BankView[]
}

export interface BankView {
  id: string
  areaId: string
  name: string
  sortOrder: number
  rows: number | null
  columns: number | null
  notes: string | null
  lockerCount: number
}

export interface LockerView {
  id: string
  number: string
  bankId: string
  row: number | null
  column: number | null
  tier: 'top' | 'middle' | 'bottom' | null
  capacity: number
  accessible: boolean
  status: 'in_service' | 'out_of_service' | 'reserved'
  outOfServiceReason: string | null
  notes: string | null
  lockType: LockType | null
  codeStatus: string | null
  /** Current holders (names only; codes never cross here). */
  holders: { studentId: string; name: string; group: string | null }[]
}

export interface SchoolProfile {
  name: string
  shortName: string | null
  colourPrimary: string | null
  colourAccent: string | null
  colourStripes: string[]
  address: string | null
  hasLogo: boolean
  hasMonoLogo: boolean
  logoDataUrl: string | null
  monoLogoDataUrl: string | null
}
