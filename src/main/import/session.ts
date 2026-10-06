import { randomUUID } from 'node:crypto'
import type { FilePreview, FileSettings } from '@shared/importTypes'
import { yearFromFileName } from './groups'
import { detectPreset, mapColumns, norm } from '@shared/importPresets'
import { findHeaderRow, firstDataSheet, parseFile, parsePasted, type ParsedFile } from './parse'

// Files being imported are held in the main process between steps of the import
// screen, so their contents cross to the window only as short previews. They are
// dropped after an hour or when the import finishes.

interface Pending {
  files: ParsedFile[]
  createdAt: number
}

const pending = new Map<string, Pending>()
const TTL = 60 * 60 * 1000

function sweep(): void {
  const now = Date.now()
  for (const [k, v] of pending) if (now - v.createdAt > TTL) pending.delete(k)
}

export function savedMappingKey(headers: readonly string[]): string {
  return headers.map(norm).filter(Boolean).join('|')
}

function preview(
  file: ParsedFile,
  i: number,
  saved: Record<string, Partial<FileSettings['mapping']>>
): FilePreview {
  const sheetIndex = firstDataSheet(file.sheets)
  const rows = file.sheets[sheetIndex]?.rows ?? []
  const headerRow = findHeaderRow(rows)
  const headers = rows[headerRow] ?? []
  const preset = detectPreset(headers)
  const remembered = saved[savedMappingKey(headers)]
  return {
    fileIndex: i,
    fileName: file.fileName,
    sheets: file.sheets.map((s) => ({
      name: s.name,
      rowCount: s.rows.length,
      rows: s.rows.slice(0, 25)
    })),
    sheetIndex,
    headerRow,
    presetId: remembered ? 'saved' : preset.id,
    mapping: remembered ?? mapColumns(headers, preset),
    yearFromName: yearFromFileName(file.fileName),
    encoding: file.encoding
  }
}

export async function loadImport(
  files: readonly { name: string; bytes: Uint8Array }[],
  pasted: string | null,
  saved: Record<string, Partial<FileSettings['mapping']>>
): Promise<{ importId: string; previews: FilePreview[] }> {
  sweep()
  const parsed: ParsedFile[] = []
  for (const f of files) parsed.push(await parseFile(f.name, f.bytes))
  if (pasted && pasted.trim()) parsed.push(parsePasted(pasted))
  if (parsed.length === 0) throw new Error('Choose at least one file, or paste a table.')
  for (const p of parsed) {
    if (p.sheets.every((s) => s.rows.length < 2))
      throw new Error(`"${p.fileName}" has no rows to import.`)
  }
  const importId = randomUUID()
  pending.set(importId, { files: parsed, createdAt: Date.now() })
  return { importId, previews: parsed.map((p, i) => preview(p, i, saved)) }
}

export function pendingFiles(importId: string): ParsedFile[] {
  const p = pending.get(importId)
  if (!p) throw new Error('This import has expired. Start the import again.')
  return p.files
}

export function headersFor(importId: string, settings: readonly FileSettings[]): string[][] {
  return pendingFiles(importId).map((f, i) => {
    const s = settings[i]
    return s ? (f.sheets[s.sheetIndex]?.rows[s.headerRow] ?? []) : []
  })
}

export function discardImport(importId: string): void {
  pending.delete(importId)
}
