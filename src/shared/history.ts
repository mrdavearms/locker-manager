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

/** What putting a record back from a backup would change (SPEC.md 4.12). */
export interface RecordRestorePreview {
  entity: 'student' | 'locker'
  backupAt: string
  changes: { field: string; now: string; before: string }[]
}

export interface QuickResult {
  kind: 'student' | 'locker'
  id: string
  title: string
  subtitle: string
  lockerId: string | null
  studentId: string | null
}

/** "school.renamed" -> "Renamed the school". Unknown actions are shown tidied. */
export function describeAction(action: string): string {
  const known: Record<string, string> = {
    'file.created': 'Created the file',
    'file.migrated': 'Updated the file for a new version',
    'file.restored': 'Restored a backup',
    'school.renamed': 'Renamed the school',
    'lock.taken_over': 'Took over editing',
    'conflict.kept_mine': 'Kept their own version in a conflict',
    'storage.rules_set': 'Changed how long backups are kept',
    'record.restored': 'Put a record back to how it was',
    'conflict.merged': 'Added their changes to the other version after a conflict',
    'copy.set_aside': 'Set aside a sync copy',
    'copy.used': 'Used a sync copy',
    'demo.generated': 'Built the demo school',
    'school.updated': 'Changed the school details',
    'school.logo_set': 'Changed the logo',
    'school.logo_removed': 'Removed the logo',
    'terms.updated': 'Changed the words the school uses',
    'area.created': 'Added an area',
    'area.updated': 'Changed an area',
    'area.removed': 'Removed an area',
    'bank.created': 'Added a bank',
    'bank.updated': 'Changed a bank',
    'bank.removed': 'Removed a bank',
    'lockers.added': 'Added lockers',
    'lockers.quick_start': 'Added all the lockers in one step',
    'locker.updated': 'Changed a locker',
    'locker.renumbered': 'Renumbered a locker',
    'locker.removed': 'Removed a locker',
    'locks.set_for_bank': 'Changed the locks for a bank',
    'locks.defaults_set': 'Changed the usual lock',
    'setup.completed': 'Finished set-up',
    'setup.item_not_used': 'Set aside a getting-started item',
    'setup.item_used': 'Brought back a getting-started item',
    'students.imported': 'Imported students',
    'student.added': 'Added a student by hand',
    'student.updated': 'Changed a student',
    'student.name_confirmed': 'Confirmed a name',
    'student.still_enrolled': 'Confirmed a student is still enrolled',
    'student.left': 'Recorded a student leaving',
    'student.released': 'Took back a locker',
    'student.assigned': 'Gave a locker',
    'student.moved': 'Moved a student',
    'students.swapped': 'Swapped two students',
    'exclusion.added': 'Excluded from lockers',
    'exclusion.removed': 'Removed an exclusion',
    'group.display_set': 'Changed how a group shows',
    'group.sort_last_set': 'Changed the groups placed last',
    'codes.rules_set': 'Changed the code rules',
    'codes.set_generated': 'Made a code set',
    'lock.reset_done': 'Reset a lock',
    'codes.reset_done_many': 'Marked locks as reset',
    'code.shown': 'Showed a code',
    'code.changed': 'Issued a new code',
    'code.fixed_recorded': 'Recorded a padlock code',
    'allocation.plan_saved': 'Saved the allocation plan',
    'allocation.committed': 'Allocated lockers',
    'labels.printed': 'Printed labels',
    'labels.stock_measured': 'Measured the label sheets',
    'labels.stock_reset': 'Went back to the published label sizes',
    'labels.template_saved': 'Changed the label layout',
    'labels.layout_reset': 'Went back to the standard label layout',
    'labels.printer_saved': 'Saved a printer nudge',
    'labels.printer_removed': 'Removed a printer nudge',
    'letters.printed': 'Printed letters',
    'letters.template_set': 'Changed the letter',
    'letters.template_reset': 'Went back to the standard letter',
    'letters.image_added': 'Added a picture for letters',
    'letters.image_removed': 'Removed a picture for letters',
    'student.language_set': 'Changed a student’s letter language',
    'report.printed': 'Printed a report',
    'report.exported': 'Exported a list',
    'file.exported': 'Exported the whole file',
    'file.rebuilt_from_export': 'Made this file from a portable export',
    'file.named_backup': 'Kept a named backup',
    'practice.started': 'Started a practice copy',
    'practice.copied': 'Made a practice copy on their computer',
    'settings.imported': 'Brought in settings from a settings file',
    'rollover.started': 'Started the move to next year',
    'locks.reset_by_students': 'Recorded locks reset to 0 0 0 0 by students',
    'year.archived': 'Archived the school year',
    'students.promoted': 'Moved students up a year level',
    'rollover.finished': 'Finished the move to next year',
    'key.number_set': 'Changed a key number',
    'privacy.pin_set': 'Set the PIN for codes',
    'privacy.pin_removed': 'Removed the PIN for codes',
    'privacy.auto_hide_set': 'Changed how long codes stay on screen',
    'key.issued': 'Gave out a key',
    'key.returned': 'Recorded a key returned',
    'key.lost': 'Recorded a key lost',
    'key.replaced': 'Recorded a key replaced',
    'key.charged': 'Recorded a charge for a key',
    undo: 'Undid a change',
    redo: 'Redid a change'
  }
  return known[action] ?? action.replace(/[._]/g, ' ')
}
