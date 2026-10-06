// Types shared by the import screens and the import engine (SPEC.md 4.2).

export const IMPORT_FIELDS = [
  'externalId',
  'firstName',
  'lastName',
  'preferredName',
  'yearLevel',
  'group',
  'house',
  'gender',
  'email'
] as const
export type ImportField = (typeof IMPORT_FIELDS)[number]

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  externalId: 'Student ID',
  firstName: 'First name',
  lastName: 'Last name',
  preferredName: 'Preferred name',
  yearLevel: 'Year level',
  group: 'Group (Homeroom)',
  house: 'House',
  gender: 'Gender',
  email: 'Email'
}

export interface SheetPreview {
  name: string
  rowCount: number
  /** The first rows, as text, for the operator to see. */
  rows: string[][]
}

export interface FilePreview {
  fileIndex: number
  fileName: string
  sheets: SheetPreview[]
  /** Which sheet holds the students (the first one with data, unless changed). */
  sheetIndex: number
  /** Detected header row (0-based) within the chosen sheet. */
  headerRow: number
  presetId: string
  mapping: Partial<Record<ImportField, number>>
  /** A year level read from the file name, e.g. "Year 7 Export" -> "7". */
  yearFromName: string | null
  encoding: string | null
}

export interface FileSettings {
  sheetIndex: number
  headerRow: number
  mapping: Partial<Record<ImportField, number>>
  /** Where each student's year level comes from. */
  yearSource: 'column' | 'group' | 'fixed'
  fixedYear: string | null
}

export interface ImportOptions {
  /** Surname particles (de, van, von…) after conversion from capitals. */
  particles: 'lower' | 'capital'
  /** Export group code -> display group, e.g. "07A" -> "7A". Missing codes use the automatic rule. */
  groupMap: Record<string, string>
  /** When true, students absent from this import in ANY year level are possible leavers. */
  wholeSchool: boolean
}

export type ProblemKind =
  | 'blank_id'
  | 'blank_name'
  | 'duplicate_in_file'
  | 'duplicate_across_files'
  | 'wrong_year_level'
  | 'new_group'
  | 'footer_row'
  | 'name_check'
  | 'excluded'

export interface ImportProblem {
  kind: ProblemKind
  severity: 'error' | 'warning' | 'info'
  fileName: string
  /** 1-based row number as a spreadsheet shows it. */
  row: number
  message: string
}

export interface ImportedStudentView {
  externalId: string
  firstNameRaw: string
  lastNameRaw: string
  preferredNameRaw: string | null
  firstName: string
  lastName: string
  preferredName: string | null
  yearLevel: string | null
  groupCode: string | null
  groupDisplay: string | null
  house: string | null
  gender: string | null
  email: string | null
  nameCheck: string[]
  /** Another year level the row's own data points to (SPEC.md section 15, item 5). */
  yearConflict: string | null
  fileName: string
  row: number
}

export interface FieldChange {
  field:
    'name' | 'yearLevel' | 'group' | 'house' | 'gender' | 'email' | 'preferredName' | 'returning'
  from: string | null
  to: string | null
}

export interface ChangedStudent {
  studentId: string
  externalId: string
  name: string
  changes: FieldChange[]
  /** The name in the import no longer matches an operator-corrected name (kept as is). */
  overrideKept: boolean
  yearConflict: string | null
}

export interface LeaverCandidate {
  studentId: string
  externalId: string
  name: string
  yearLevel: string | null
  groupCode: string | null
  holdsLocker: boolean
}

export interface ImportAnalysis {
  students: ImportedStudentView[]
  problems: ImportProblem[]
  newStudents: ImportedStudentView[]
  changed: ChangedStudent[]
  leavers: LeaverCandidate[]
  unchanged: number
  yearLevelsCovered: string[]
  groupsSeen: { code: string; display: string; count: number; known: boolean }[]
}

export interface ImportSelections {
  /** External IDs of new students to add. */
  add: string[]
  /** Student ids whose changes to apply. */
  update: string[]
  /** Student ids to mark as possible leavers (never removed by an import). */
  markMissing: string[]
}

export interface ImportResult {
  added: number
  updated: number
  markedMissing: number
  seen: number
}
