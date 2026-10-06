import ExcelJS from 'exceljs'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { decodeText } from './decode'
import { KNOWN_HEADERS, norm } from '@shared/importPresets'

// Reads CSV, TSV, XLSX, XLS and ODS into plain rows of text (SPEC.md 4.2).

export interface ParsedSheet {
  name: string
  rows: string[][]
}

export interface ParsedFile {
  fileName: string
  sheets: ParsedSheet[]
  encoding: string | null
}

const MAX_ROWS = 20_000

function trimRows(rows: string[][]): string[][] {
  const cleaned = rows.map((r) => r.map((c) => (c ?? '').toString().replace(/\r?\n/g, ' ').trim()))
  // Drop trailing empty rows and trailing empty cells.
  while (cleaned.length > 0 && cleaned[cleaned.length - 1]!.every((c) => c === '')) cleaned.pop()
  return cleaned.slice(0, MAX_ROWS).map((r) => {
    const out = [...r]
    while (out.length > 0 && out[out.length - 1] === '') out.pop()
    return out
  })
}

export function parseDelimited(text: string): string[][] {
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), {
    delimitersToGuess: [',', ';', '\t', '|'],
    skipEmptyLines: false
  })
  return trimRows(result.data)
}

async function parseXlsx(bytes: Uint8Array): Promise<ParsedSheet[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  )
  const sheets: ParsedSheet[] = []
  wb.eachSheet((ws) => {
    const rows: string[][] = []
    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const cells: string[] = []
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cells[col - 1] = cell.text ?? ''
      })
      rows[rowNumber - 1] = Array.from(cells, (c) => c ?? '')
    })
    sheets.push({ name: ws.name, rows: trimRows(Array.from(rows, (r) => r ?? [])) })
  })
  return sheets
}

function parseWithSheetJs(bytes: Uint8Array): ParsedSheet[] {
  const wb = XLSX.read(bytes, { type: 'array', cellDates: false, cellText: true })
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name]
    const rows = ws
      ? (XLSX.utils.sheet_to_json<string[]>(ws, {
          header: 1,
          raw: false,
          defval: '',
          blankrows: true
        }) as string[][])
      : []
    return { name, rows: trimRows(rows) }
  })
}

export async function parseFile(fileName: string, bytes: Uint8Array): Promise<ParsedFile> {
  const ext = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase() ?? ''
  if (ext === 'xlsx' || ext === 'xlsm') {
    try {
      return { fileName, sheets: await parseXlsx(bytes), encoding: null }
    } catch {
      // Some "xlsx" files are really other formats; SheetJS reads most of them.
      return { fileName, sheets: parseWithSheetJs(bytes), encoding: null }
    }
  }
  if (ext === 'xls' || ext === 'ods')
    return { fileName, sheets: parseWithSheetJs(bytes), encoding: null }
  if (ext === 'csv' || ext === 'txt' || ext === 'tsv' || ext === '') {
    const { text, encoding } = decodeText(bytes)
    return { fileName, sheets: [{ name: fileName, rows: parseDelimited(text) }], encoding }
  }
  throw new Error(
    `"${fileName}" is not a file Locker Manager can read. Use CSV, Excel (.xlsx or .xls) or OpenDocument (.ods).`
  )
}

/** A table pasted from the clipboard (tab-separated from Excel, or CSV). */
export function parsePasted(text: string): ParsedFile {
  return {
    fileName: 'Pasted table',
    sheets: [{ name: 'Pasted table', rows: parseDelimited(text) }],
    encoding: 'utf-8'
  }
}

/**
 * Finds the header row: the row in the first 20 with the most known header names,
 * needing at least two. Falls back to the first row with two or more filled cells.
 */
export function findHeaderRow(rows: readonly string[][]): number {
  let best = -1
  let bestScore = 1
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const score = (rows[i] ?? []).filter((c) => KNOWN_HEADERS.has(norm(c))).length
    if (score > bestScore) {
      best = i
      bestScore = score
    }
  }
  if (best >= 0) return best
  const firstFull = rows.findIndex((r) => r.filter((c) => c !== '').length >= 2)
  return firstFull >= 0 ? firstFull : 0
}

/** The first sheet with more than one non-empty row. */
export function firstDataSheet(sheets: readonly ParsedSheet[]): number {
  const i = sheets.findIndex((s) => s.rows.filter((r) => r.some((c) => c !== '')).length > 1)
  return i >= 0 ? i : 0
}
