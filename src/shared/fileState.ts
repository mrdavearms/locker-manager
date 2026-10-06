// What the renderer knows about the open data file. Sent from main on every change.

export interface FileSummaryView {
  fileId: string | null
  schoolName: string
  demo: boolean
  schemaVersion: number
  counts: {
    students: number
    lockers: number
    currentAssignments: number
    locks: number
    historyEntries: number
  }
  lastChange: { at: string; operator: string; machine: string; action: string } | null
}

export interface HistoryLineView {
  id: string
  at: string
  operator: string
  machine: string
  action: string
  entity: string
}

export interface LockHolderView {
  operator: string
  computer: string
  startedAt: string
  heartbeatAt: string
}

export type ReadOnlyReason =
  /** Someone else is editing. */
  | 'locked'
  /** Someone else's lock has gone quiet for over 10 minutes. */
  | 'stale_lock'
  /** The file was made by a newer version of the app. */
  | 'newer_version'
  /** Someone took over editing from this computer. */
  | 'lost_lock'

export interface ReadOnlyView {
  reason: ReadOnlyReason
  holder: LockHolderView | null
  canTakeOver: boolean
  /** The other editor has finished; this computer may start editing. */
  canStartEditing: boolean
}

export interface ConflictView {
  /** changed_on_disk: someone saved over us. missing: the file vanished. copy: comparing with a sync copy. */
  reason: 'changed_on_disk' | 'missing' | 'copy'
  copyName: string | null
  mine: FileSummaryView
  theirs: FileSummaryView | null
  onlyMine: HistoryLineView[]
  onlyTheirs: HistoryLineView[]
}

export interface FileProblemView {
  kind: 'backup_failed' | 'save_failed' | 'lock_failed' | 'tidy_failed'
  message: string
  at: string
}

export type FileState =
  | { status: 'closed' }
  | {
      status: 'open'
      path: string
      fileName: string
      folder: string
      mode: 'edit' | 'read_only'
      readOnly: ReadOnlyView | null
      summary: FileSummaryView
      dirty: boolean
      saving: boolean
      lastSavedAt: string | null
      lastBackupAt: string | null
      problems: FileProblemView[]
      conflict: ConflictView | null
      conflictCopies: string[]
      locationWarning: string | null
      openedAt: string
      /** Goes up on every change or reload, so views know to fetch again. */
      revision: number
    }

export interface BackupView {
  source: 'shared' | 'this_computer'
  name: string
  at: string
  label: string | null
  size: number
}

export interface BackupPreview {
  backup: BackupView
  backupSummary: FileSummaryView
  currentSummary: FileSummaryView
  /** History in the current file that the backup does not have: what a restore undoes. */
  undone: HistoryLineView[]
}
