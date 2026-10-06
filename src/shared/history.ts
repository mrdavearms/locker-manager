export interface HistoryEntryView {
  id: string
  at: string
  operator: string
  machine: string
  action: string
  entity: string
  entityId: string | null
  reason: string | null
  /** A short plain description of what changed, when it can be worked out. */
  detail: string | null
}

export interface QuickResult {
  kind: 'student' | 'locker'
  id: string
  title: string
  subtitle: string
  lockerId: string | null
  studentId: string | null
}
