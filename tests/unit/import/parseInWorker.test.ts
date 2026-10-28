import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import ExcelJS from 'exceljs'
import { build } from 'esbuild'
import JSZip from 'jszip'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseInWorker } from '../../../src/main/import/parseInWorker'

// A small crafted spreadsheet made ExcelJS or SheetJS build millions of cells before
// the row and column limits applied, and the app ran out of memory and closed. Files
// are now read in a worker thread with its own limits. The worker is bundled here the
// way tests/crash bundles its child. Every file is SYNTHETIC.

const work = mkdtempSync(join(tmpdir(), 'lm-parse-worker-'))
const workerJs = join(work, 'importWorker.cjs')
// Low limits keep the test quick; the app uses PARSE_LIMITS.
const limits = { memoryMb: 128, timeMs: 60_000 }

beforeAll(async () => {
  await build({
    entryPoints: ['src/main/import/parseWorker.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: workerJs,
    alias: { '@shared': resolve('src/shared') },
    logLevel: 'silent'
  })
}, 60_000)

afterAll(() => {
  rmSync(work, { recursive: true, force: true })
})

async function workbook(edit: (sheetXml: string) => string = (x) => x): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('SYNTHETIC')
  ws.addRow(['Student ID', 'First name'])
  ws.addRow(['SYN001', 'Alex'])
  const zip = await JSZip.loadAsync(await wb.xlsx.writeBuffer())
  const path = 'xl/worksheets/sheet1.xml'
  zip.file(path, edit(await zip.file(path)!.async('string')))
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

describe('reading an import file in a worker', () => {
  it('reads an ordinary workbook', async () => {
    const file = await parseInWorker(workerJs, 'students.xlsx', await workbook(), limits)
    expect(file.sheets[0]!.rows).toEqual([
      ['Student ID', 'First name'],
      ['SYN001', 'Alex']
    ])
  })

  it('stops a workbook with one huge merged range, with a plain message', async () => {
    const bomb = await workbook((x) =>
      x.replace(
        '</sheetData>',
        '</sheetData><mergeCells count="1"><mergeCell ref="A3:J3000000"/></mergeCells>'
      )
    )
    expect(bomb.byteLength).toBeLessThan(20_000)
    await expect(parseInWorker(workerJs, 'bomb.xlsx', bomb, limits)).rejects.toThrow(
      /"bomb.xlsx" is too large or too complicated to read/
    )
  }, 60_000)

  it('stops an OpenDocument file with a huge repeated column', async () => {
    const ods = new TextEncoder().encode(
      `<?xml version="1.0"?><office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:mimetype="application/vnd.oasis.opendocument.spreadsheet"><office:body><office:spreadsheet><table:table table:name="S"><table:table-row><table:table-cell office:value-type="string"><text:p>ID</text:p></table:table-cell></table:table-row><table:table-row table:number-rows-repeated="20000"><table:table-cell table:number-columns-repeated="16000" office:value-type="string"><text:p>x</text:p></table:table-cell></table:table-row></table:table></office:spreadsheet></office:body></office:document>`
    )
    await expect(parseInWorker(workerJs, 'bomb.ods', ods, limits)).rejects.toThrow(
      /too large or too complicated/
    )
  }, 60_000)

  it('passes on the reader’s own message for a file it refuses', async () => {
    await expect(
      parseInWorker(workerJs, 'notes.pdf', new Uint8Array([1, 2, 3]), limits)
    ).rejects.toThrow(/not a file Locker Manager can read/)
  })
})
