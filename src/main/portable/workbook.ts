import ExcelJS from 'exceljs'
import { LOCK_TYPE_INFO, type LockType } from '@shared/locks'
import { LockerDb } from '../db/db'
import { appendAudit, newId, setMeta, type OperatorContext } from '../db/context'
import { LATEST_SCHEMA_VERSION, migrate, migrations } from '../db/migrate'
import { codeKey, decryptCode, encryptCode, readCodeKey } from '../codes/cipher'
import { compareLockerNumbers } from '../locations/lockerNumbers'

// The portable export (SPEC.md 5.5): the whole data file as one Excel workbook,
// a sheet per table, readable by people, for archiving and for leaving the app.
// The same workbook can be turned back into a data file.
//
// - "Read me" says what it is, when, by whom, and whether codes are included.
// - "Lockers" is a plain summary for people.
// - Every other sheet is one table, its first row the column names.
// - Pictures and very long text go on "Files" in pieces, referenced as file:<id>.
// - Codes are written as plain text only when the person exporting ticks the box;
//   the code key itself is never exported. Importing makes a new key.

const MARKER = 'Locker Manager portable export'
const CHUNK = 30_000
const README = 'Read me'
const SUMMARY = 'Lockers'
const FILES = 'Files'
const SKIP_META = new Set(['code_key_v1', 'renumber_in_progress'])

interface ColumnInfo {
  name: string
  type: string
  notnull: number
}

function tables(db: LockerDb): string[] {
  return db
    .all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .map((r) => r.name)
}

function columns(db: LockerDb, table: string): ColumnInfo[] {
  return db.all<ColumnInfo>(`PRAGMA table_info("${table.replace(/"/g, '')}")`)
}

const isCipher = (col: string): boolean => col.endsWith('_cipher')

export interface ExportInfo {
  operator: string
  appVersion: string
  includeCodes: boolean
  now: Date
}

function lockerSummary(db: LockerDb, key: Buffer | null, includeCodes: boolean): string[][] {
  const rows = db.all<{
    number: string
    area: string
    bank: string
    status: string
    sname: string | null
    external_id: string | null
    group_code: string | null
    year_level: string | null
    type: LockType | null
    code_cipher: Uint8Array | null
    key_number: string | null
  }>(
    `SELECT l.number, a.name AS area, b.name AS bank, l.status,
            s.last_name || ', ' || s.first_name AS sname, s.external_id, s.group_code, s.year_level,
            k.type, k.code_cipher, k.key_number
       FROM locker l JOIN bank b ON b.id = l.bank_id JOIN area a ON a.id = b.area_id
       LEFT JOIN assignment x ON x.locker_id = l.id AND x.status = 'current'
       LEFT JOIN student s ON s.id = x.student_id
       LEFT JOIN lock k ON k.id = (SELECT id FROM lock WHERE locker_id = l.id AND status IN ('in_use','spare') LIMIT 1)
      WHERE l.archived_at IS NULL`
  )
  rows.sort((a, b) => compareLockerNumbers(a.number, b.number))
  const header = [
    'Locker',
    'Area',
    'Bank',
    'Status',
    'Student',
    'Student ID',
    'Group',
    'Year level',
    'Lock',
    ...(includeCodes ? ['Code'] : []),
    'Key number'
  ]
  return [
    header,
    ...rows.map((r) => [
      r.number,
      r.area,
      r.bank,
      r.status.replace(/_/g, ' '),
      r.sname ?? '',
      r.external_id ?? '',
      r.group_code ?? '',
      r.year_level ?? '',
      r.type ? LOCK_TYPE_INFO[r.type].name : '',
      ...(includeCodes ? [decryptCode(key, r.code_cipher) ?? ''] : []),
      r.key_number ?? ''
    ])
  ]
}

export async function exportWorkbook(db: LockerDb, info: ExportInfo): Promise<Uint8Array> {
  const key = readCodeKey(db)
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Locker Manager'
  wb.created = info.now
  const school = db.get<{ name: string }>('SELECT name FROM school LIMIT 1')?.name ?? ''

  const readme = wb.addWorksheet(README)
  const about: [string, string][] = [
    [MARKER, ''],
    ['School', school],
    ['Exported', info.now.toISOString()],
    ['Exported by', info.operator],
    ['App version', info.appVersion],
    ['Schema version', String(db.userVersion)],
    ['Codes included', info.includeCodes ? 'Yes' : 'No'],
    ['', ''],
    [
      'What this is',
      'Everything in the data file. "Lockers" is a summary to read. Every sheet after it is one table from the file, with the column names in the first row.'
    ],
    [
      'Bringing it back',
      'In Locker Manager, choose File, then "New file from a portable export". Do not rename the sheets or the first-row column names, or that will not work.'
    ],
    [
      'Keep it safe',
      info.includeCodes
        ? 'CONFIDENTIAL: this workbook contains every lock code. Store it as securely as the data file.'
        : 'This workbook has student names but no lock codes. Store it as securely as the data file.'
    ]
  ]
  for (const row of about) readme.addRow(row)
  readme.getColumn(1).width = 20
  readme.getColumn(2).width = 100
  readme.getRow(1).font = { bold: true, size: 14 }
  if (info.includeCodes) readme.getRow(11).font = { bold: true, color: { argb: 'FFB00020' } }

  const summary = wb.addWorksheet(SUMMARY)
  for (const r of lockerSummary(db, key, info.includeCodes)) summary.addRow(r)
  summary.getRow(1).font = { bold: true }
  summary.views = [{ state: 'frozen', ySplit: 1 }]

  const files: [string, number, string, string][] = []
  const putFile = (kind: 'base64' | 'text', value: string, mime = ''): string => {
    const id = newId()
    for (let i = 0, part = 0; i < value.length || part === 0; i += CHUNK, part++)
      files.push([
        id,
        part,
        kind === 'base64' ? `base64:${mime}` : 'text',
        value.slice(i, i + CHUNK)
      ])
    return `file:${id}`
  }

  for (const table of tables(db)) {
    const cols = columns(db, table)
    const ws = wb.addWorksheet(table.slice(0, 31))
    ws.addRow(cols.map((c) => c.name))
    ws.getRow(1).font = { bold: true }
    const rows = db.all<Record<string, unknown>>(
      table === 'meta' ? 'SELECT * FROM meta' : `SELECT * FROM "${table}"`
    )
    for (const r of rows) {
      if (table === 'meta' && SKIP_META.has(String(r.key))) continue
      ws.addRow(
        cols.map((c) => {
          const v = r[c.name]
          if (v === null || v === undefined) return null
          if (v instanceof Uint8Array) {
            if (isCipher(c.name)) return info.includeCodes ? (decryptCode(key, v) ?? null) : null
            const mime =
              table === 'school'
                ? String(r[c.name === 'logo' ? 'logo_type' : 'logo_mono_type'] ?? '')
                : String(r.mime ?? '')
            return putFile('base64', Buffer.from(v).toString('base64'), mime)
          }
          if (typeof v === 'string' && v.length > CHUNK) return putFile('text', v)
          return v as string | number
        })
      )
    }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
  }

  const fsheet = wb.addWorksheet(FILES)
  fsheet.addRow(['id', 'part', 'kind', 'data'])
  for (const f of files) fsheet.addRow(f)
  return new Uint8Array(await wb.xlsx.writeBuffer())
}

// ---------------------------------------------------------------- import

function cellValue(v: ExcelJS.CellValue): string | number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number' || typeof v === 'string') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object' && 'richText' in v) return v.richText.map((t) => t.text).join('')
  if (typeof v === 'object' && 'text' in v) return String(v.text)
  if (typeof v === 'object' && 'result' in v) return cellValue(v.result as ExcelJS.CellValue)
  return String(v as unknown as string)
}

function sheetRows(ws: ExcelJS.Worksheet): (string | number | null)[][] {
  const out: (string | number | null)[][] = []
  ws.eachRow({ includeEmpty: false }, (row) => {
    const values: (string | number | null)[] = []
    const n = ws.columnCount
    for (let i = 1; i <= n; i++) values.push(cellValue(row.getCell(i).value))
    out.push(values)
  })
  return out
}

export interface ImportedWorkbook {
  db: LockerDb
  school: string
  codesIncluded: boolean
  schemaVersion: number
}

/** Rebuilds a data file from a portable export. Never touches any existing file. */
export async function importWorkbook(
  bytes: Uint8Array,
  ctx: OperatorContext
): Promise<ImportedWorkbook> {
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer)
  } catch {
    throw new Error('That file could not be read as an Excel workbook.')
  }
  const readme = wb.getWorksheet(README)
  const about = new Map<string, string>()
  if (readme) for (const r of sheetRows(readme)) about.set(String(r[0] ?? ''), String(r[1] ?? ''))
  if (!readme || !about.has(MARKER))
    throw new Error('That workbook is not a Locker Manager portable export.')
  const version = Number(about.get('Schema version'))
  if (!Number.isInteger(version) || version < 1)
    throw new Error('The export does not say which version made it.')
  if (version > LATEST_SCHEMA_VERSION)
    throw new Error('That export was made by a newer version of Locker Manager. Update first.')
  const codesIncluded = about.get('Codes included') === 'Yes'

  // Pieces of pictures and long text.
  const fileParts = new Map<string, { kind: string; parts: [number, string][] }>()
  const fsheet = wb.getWorksheet(FILES)
  if (fsheet)
    for (const [i, r] of sheetRows(fsheet).entries()) {
      if (i === 0) continue
      const id = String(r[0] ?? '')
      const f = fileParts.get(id) ?? { kind: String(r[2] ?? ''), parts: [] }
      f.parts.push([Number(r[1] ?? 0), String(r[3] ?? '')])
      fileParts.set(id, f)
    }
  const resolve = (ref: string): string | Uint8Array => {
    const f = fileParts.get(ref.slice(5))
    if (!f) throw new Error('A picture or long text is missing from the "Files" sheet.')
    const joined = f.parts
      .sort((a, b) => a[0] - b[0])
      .map((p) => p[1])
      .join('')
    return f.kind.startsWith('base64') ? new Uint8Array(Buffer.from(joined, 'base64')) : joined
  }

  const db = await LockerDb.create()
  try {
    migrate(db, migrations.slice(0, version))
    const key = codeKey(db)
    db.run('PRAGMA foreign_keys = OFF')
    db.transaction(() => {
      // The new file has its own key; drop the meta rows the empty file made.
      for (const table of tables(db)) {
        const ws = wb.getWorksheet(table.slice(0, 31))
        if (!ws) continue
        const cols = new Map(columns(db, table).map((c) => [c.name, c]))
        const rows = sheetRows(ws)
        const header = (rows[0] ?? []).map((h) => String(h ?? ''))
        const used = header.map((h, i) => [h, i] as const).filter(([h]) => cols.has(h))
        if (used.length === 0) continue
        if (table === 'meta') db.run("DELETE FROM meta WHERE key <> 'code_key_v1'")
        const sql = `INSERT OR REPLACE INTO "${table}" (${used.map(([h]) => `"${h}"`).join(', ')}) VALUES (${used
          .map((_, i) => `$p${i}`)
          .join(', ')})`
        for (const r of rows.slice(1)) {
          if (table === 'meta' && SKIP_META.has(String(r[header.indexOf('key')] ?? ''))) continue
          const params: Record<string, string | number | Uint8Array | null> = {}
          used.forEach(([h, i], n) => {
            const col = cols.get(h)!
            let v: string | number | Uint8Array | null = r[i] ?? null
            if (typeof v === 'string' && v.startsWith('file:') && fileParts.has(v.slice(5)))
              v = resolve(v)
            if (isCipher(h))
              v = codesIncluded && v !== null && v !== '' ? encryptCode(key, String(v)) : null
            if (v === null && col.notnull) v = ''
            if (col.type.toUpperCase() === 'TEXT' && typeof v === 'number') v = String(v)
            params[`$p${n}`] = v
          })
          db.run(sql, params)
        }
      }
      if (!codesIncluded) {
        // Without codes, nobody knows what the locks are set to.
        db.run(
          "UPDATE lock SET code_status = 'needs_new_code' WHERE code_status IN ('set', 'awaiting_physical_reset')"
        )
        db.run('DELETE FROM code_set_entry WHERE code_cipher IS NULL OR length(code_cipher) = 0')
      }
      // A rebuilt file is a new file: its own identity, so it never clashes with the original.
      setMeta(db, 'file_id', newId())
      setMeta(db, 'rebuilt_from_export_at', ctx.now().toISOString())
      appendAudit(db, ctx, {
        action: 'file.rebuilt_from_export',
        entity: 'file',
        after: { codesIncluded, schemaVersion: version }
      })
    })
    db.run('PRAGMA foreign_keys = ON')
    if (db.foreignKeyProblems() > 0)
      throw new Error('The workbook’s tables do not fit together. Was a sheet edited?')
    migrate(db)
    const school = db.get<{ name: string }>('SELECT name FROM school LIMIT 1')?.name
    if (!school) throw new Error('The workbook has no school in it.')
    return { db, school, codesIncluded, schemaVersion: version }
  } catch (error) {
    db.close()
    throw error
  }
}
