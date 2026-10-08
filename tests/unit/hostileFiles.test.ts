import { EventEmitter } from 'node:events'
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import type { LetterRecord } from '../../src/shared/letters'
import type { LabelRecord } from '../../src/shared/labels'
import { DEFAULT_TERMS } from '../../src/shared/terminology'
import { defaultLetterTemplate } from '../../src/main/letters/defaultTemplate'
import { exportWorkbook, importWorkbook } from '../../src/main/portable/workbook'
import { guardRenderContents, renderRequestAllowed } from '../../src/main/render/guard'
import { buildLabelSheets } from '../../src/main/render/labelSheet'
import { defaultTemplate } from '../../src/main/render/layout'
import { buildLetters } from '../../src/main/render/letter'
import { BUILT_IN_STOCKS } from '../../src/main/render/stocks'
import { addImage, letterImages } from '../../src/main/repos/letters'
import { getSchoolProfile } from '../../src/main/repos/school'
import { allocatedDemo } from './fixtures'
import { testContext } from './helpers'

// A crafted data file or workbook must not be able to put markup into the hidden
// print windows, nor make them load anything (security review M1).

const EVIL =
  'image/png;base64,AA)}</style><meta http-equiv="refresh" content="0;url=https://x.example/">'
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

describe('picture types are allow-listed', () => {
  it('a logo with a type the app does not make is left out', async () => {
    const { db } = await allocatedDemo()
    db.run('UPDATE school SET logo = $b, logo_type = $t, logo_mono = $b, logo_mono_type = $t', {
      $b: PNG,
      $t: EVIL
    })
    const p = getSchoolProfile(db)
    expect(p.logoDataUrl).toBeNull()
    expect(p.monoLogoDataUrl).toBeNull()
    db.run("UPDATE school SET logo_type = 'image/png'")
    expect(getSchoolProfile(db).logoDataUrl).toMatch(/^data:image\/png;base64,/)
  })

  it('a letter picture with a type the app does not make is left out', async () => {
    const { db, ctx } = await allocatedDemo()
    addImage(db, ctx, { name: 'a.png', mime: 'image/png', bytes: PNG, width: 1, height: 1 })
    db.run('PRAGMA ignore_check_constraints = ON')
    db.run(
      `INSERT INTO image (id, name, mime, data, width, height, created_at, updated_at, updated_by)
       VALUES ('evil', 'b.png', $m, $d, 1, 1, 'x', 'x', 'x')`,
      { $m: EVIL, $d: PNG }
    )
    const images = letterImages(db)
    expect(images.has('evil')).toBe(false)
    expect(images.size).toBe(1)
  })

  it('label and letter pages never carry a picture address that is not a plain image', () => {
    const stock = BUILT_IN_STOCKS.find((s) => s.id === 'avery-l7163')!
    const record: LabelRecord = {
      lockerId: 'l1',
      number: '12',
      area: 'Year 7 side',
      bank: 'North wall',
      qrId: 'q1',
      status: 'assigned',
      firstName: 'Ava',
      lastName: 'Nguyen',
      group: '7A',
      yearLevel: '7'
    }
    const sheet = buildLabelSheets({
      stock,
      template: defaultTemplate(stock),
      records: [record],
      startAt: 1,
      offset: { right: 0, down: 0 },
      terms: DEFAULT_TERMS,
      logo: { colour: `data:${EVIL}`, mono: null },
      qr: new Map(),
      outlines: false
    })
    expect(sheet.html).not.toContain('http-equiv="refresh"')
    expect(sheet.html).not.toContain('x.example')

    const letterRecord: LetterRecord = {
      studentId: 's1',
      lockerId: 'l1',
      firstName: 'Ava',
      lastName: 'Nguyen',
      group: '7A',
      yearLevel: '7',
      locker: '12',
      bank: 'North wall',
      area: 'Year 7 side',
      lockType: 'built-in combination lock',
      kind: 'settable',
      keyNumber: null,
      language: null
    }
    const letters = buildLetters(
      {
        template: defaultLetterTemplate(),
        terms: DEFAULT_TERMS,
        school: {
          name: 'SYNTHETIC High School',
          logo: `data:${EVIL}`,
          primary: '#1F3A5F',
          accent: '#E8A33D',
          stripes: []
        },
        images: new Map([['p1', { dataUrl: `data:${EVIL}`, width: 1, height: 1 }]]),
        today: new Date('2026-10-06'),
        preview: false
      },
      [{ record: letterRecord, code: '4721', masked: false, lang: 'en' }]
    )
    expect(letters.html).not.toContain('http-equiv="refresh"')
    expect(letters.html).not.toContain('x.example')
  })

  it('a workbook with a picture of another type comes back without that picture', async () => {
    const { db, ctx } = await allocatedDemo()
    addImage(db, ctx, { name: 'a.png', mime: 'image/png', bytes: PNG, width: 1, height: 1 })
    addImage(db, ctx, { name: 'b.png', mime: 'image/png', bytes: PNG, width: 1, height: 1 })
    const bytes = await exportWorkbook(db, {
      operator: 'Test Operator',
      appVersion: '0.6.0',
      includeCodes: false,
      now: new Date('2026-10-06T10:00:00Z')
    })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer)
    const ws = wb.worksheets.find((w) => w.name.toLowerCase().includes('image'))!
    const header = (ws.getRow(1).values as unknown[]).map((v) => String(v ?? ''))
    const mimeCol = header.indexOf('mime')
    ws.getRow(2).getCell(mimeCol).value = EVIL
    const tampered = new Uint8Array(await wb.xlsx.writeBuffer())
    const back = await importWorkbook(tampered, testContext())
    const mimes = back.db.all<{ mime: string }>('SELECT mime FROM image').map((r) => r.mime)
    expect(mimes).toEqual(['image/png'])
  })
})

describe('the hidden print windows never leave the page they were given', () => {
  it('blocks navigation and redirects', () => {
    const contents = new EventEmitter()
    guardRenderContents(contents as unknown as Parameters<typeof guardRenderContents>[0])
    for (const event of ['will-navigate', 'will-redirect', 'will-frame-navigate']) {
      let prevented = false
      contents.emit(event, { preventDefault: () => (prevented = true) }, 'https://x.example/')
      expect(prevented, event).toBe(true)
    }
  })

  it('lets only its own file and data addresses load', () => {
    expect(renderRequestAllowed('file:///tmp/locker-manager-ab.html')).toBe(true)
    expect(renderRequestAllowed('data:image/png;base64,AA')).toBe(true)
    expect(renderRequestAllowed('https://x.example/')).toBe(false)
    expect(renderRequestAllowed('http://127.0.0.1/')).toBe(false)
    expect(renderRequestAllowed('ftp://x.example/')).toBe(false)
  })
})
