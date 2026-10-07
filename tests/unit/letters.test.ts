import { describe, expect, it } from 'vitest'
import type { LetterRecord, LetterTemplate } from '../../src/shared/letters'
import { DEFAULT_TERMS } from '../../src/shared/terminology'
import { defaultLetterTemplate } from '../../src/main/letters/defaultTemplate'
import { formatBody, formatLine } from '../../src/main/letters/text'
import { buildLetters, pick, showsFor, type LetterItem } from '../../src/main/render/letter'
import { PDFDocument } from 'pdf-lib'
import { runLetterJob } from '../../src/main/render/letterJob'
import { prepareLetterChunks, prepareLetters } from '../../src/main/render/prepareLetters'
import {
  issueCode,
  lockForLocker,
  markNeedsNewCode,
  markResetDone
} from '../../src/main/repos/codes'
import { recordPrintJob } from '../../src/main/repos/labels'
import {
  addImage,
  deleteImage,
  letterSet,
  letterTemplate,
  saveLetterTemplate,
  setStudentLanguage
} from '../../src/main/repos/letters'
import { allocatedDemo } from './fixtures'

const school = {
  name: 'SYNTHETIC High School',
  logo: null,
  primary: '#1F3A5F',
  accent: '#E8A33D',
  stripes: []
}

function rec(kind: LetterRecord['kind'], over: Partial<LetterRecord> = {}): LetterRecord {
  return {
    studentId: `s-${kind}`,
    lockerId: `l-${kind}`,
    firstName: 'Ava',
    lastName: 'Nguyen',
    group: '7A',
    yearLevel: '7',
    locker: '12',
    bank: 'North wall',
    area: 'Year 7 side',
    lockType: 'built-in combination lock',
    kind,
    keyNumber: kind === 'keyed' ? 'K-204' : null,
    language: null,
    ...over
  }
}

function build(items: LetterItem[], template: LetterTemplate = defaultLetterTemplate()) {
  return buildLetters(
    {
      template,
      terms: DEFAULT_TERMS,
      school,
      images: new Map(),
      today: new Date('2026-10-06'),
      preview: false
    },
    items
  )
}

describe('letter words (SPEC.md 5.2)', () => {
  it('turns lines into paragraphs, bullet points, numbered steps and bold', () => {
    expect(formatBody('One\ntwo\n\n- a\n- b\n\n1. first\n2. **second**', {})).toBe(
      '<p>One<br>two</p><ul><li>a</li><li>b</li></ul><ol><li>first</li><li><b>second</b></li></ol>'
    )
  })
  it('fills merge fields, escapes them, and leaves unknown ones as typed', () => {
    expect(
      formatLine('Locker {locker} for {first_name} {nope}', {
        locker: '7',
        first_name: '<b>Al</b>'
      })
    ).toBe('Locker 7 for &lt;b&gt;Al&lt;/b&gt; {nope}')
  })
  it('never turns a merged value into bold or a list', () => {
    expect(formatBody('{first_name}', { first_name: '**Zed**' })).toBe('<p>**Zed**</p>')
  })
})

describe('the standard letter', () => {
  const t = defaultLetterTemplate()
  it('has no footer, credit or source line, and no wording that dates', () => {
    const all = JSON.stringify(t).toLowerCase()
    for (const bad of ['picture', 'credit', 'source', 'this year', 'renovation', 'signed'])
      expect(all).not.toContain(bad)
  })
  it('shows "Set your code" only for settable locks and "Your key" only for keyed ones', () => {
    const settable = build([
      { record: rec('settable'), code: '4827', masked: false, lang: 'en' }
    ]).html
    const keyed = build([{ record: rec('keyed'), code: null, masked: false, lang: 'en' }]).html
    expect(settable).toContain('Set your code')
    expect(settable).not.toContain('Your key')
    expect(keyed).toContain('Your key')
    expect(keyed).toContain('K-204')
    expect(keyed).not.toContain('Set your code')
    expect(keyed).not.toContain('Keep your code secret')
    expect(showsFor('code', 'fixed')).toBe(true)
    expect(showsFor('settable', 'fixed')).toBe(false)
  })
  it('prints the code in boxes, or dots on screen', () => {
    const real = build([{ record: rec('settable'), code: '4827', masked: false, lang: 'en' }]).html
    const masked = build([{ record: rec('settable'), code: '4827', masked: true, lang: 'en' }]).html
    expect(real).toContain('<span>4</span><span>8</span><span>2</span><span>7</span>')
    expect(masked).not.toMatch(/4827|<span>4<\/span>/)
    expect(masked).toContain('<span>•</span>')
  })
  it('makes one page per student', () => {
    const items = ['a', 'b', 'c'].map((x) => ({
      record: rec('settable', { studentId: x }),
      code: '4827',
      masked: false,
      lang: 'en'
    }))
    expect(build(items).html.match(/<section class="letter"/g)).toHaveLength(3)
  })
  it('flags a name too long for the panel', () => {
    const r = build([
      {
        record: rec('settable', {
          firstName: 'Ava',
          lastName: 'Wolfeschlegelsteinhausenbergerdorffwelchevoralternwarengewissenhaft'
        }),
        code: '4827',
        masked: false,
        lang: 'en'
      }
    ])
    expect(r.tooLong).toHaveLength(1)
  })
})

describe('languages', () => {
  it('uses the chosen language and falls back to the first for missing words', () => {
    expect(pick({ en: 'Hello', vi: 'Xin chào' }, 'vi', 'en')).toBe('Xin chào')
    expect(pick({ en: 'Hello', vi: '' }, 'vi', 'en')).toBe('Hello')
    expect(pick({ en: 'Hello' }, 'zh', 'en')).toBe('Hello')
  })
})

describe('who gets a letter (SPEC.md 4.8)', () => {
  it('gives every allocated student a letter and never a spare locker', async () => {
    const { db, assigned } = await allocatedDemo()
    const set = letterSet(db, { mode: 'all' }, true)
    expect(set.records).toHaveLength(assigned)
    expect(set.heldBack).toEqual([])
    expect(set.codes.size).toBe(assigned)
    const spare = db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM locker l WHERE NOT EXISTS (SELECT 1 FROM assignment x WHERE x.locker_id = l.id AND x.status = 'current')"
    )!.n
    expect(spare).toBeGreaterThan(0)
  })
  it('holds back a letter whose lock needs a new code', async () => {
    const { db, ctx } = await allocatedDemo()
    const first = letterSet(db, { mode: 'all' }, true).records[0]!
    markNeedsNewCode(db, ctx, lockForLocker(db, first.lockerId)!.id)
    const set = letterSet(db, { mode: 'all' }, true)
    expect(set.heldBack).toHaveLength(1)
    expect(set.heldBack[0]!.reason).toMatch(/new code/)
    expect(set.records.find((r) => r.lockerId === first.lockerId)).toBeUndefined()
  })
  it('chooses one group, one student, or the letters changed since the last print', async () => {
    const { db } = await allocatedDemo()
    const all = letterSet(db, { mode: 'all' }, true).records
    const g = letterSet(db, { mode: 'group', group: '07A' }, true).records
    expect(g.length).toBeGreaterThan(0)
    expect(g.length).toBeLessThan(all.length)
    expect(
      letterSet(db, { mode: 'student', studentId: all[3]!.studentId }, true).records
    ).toHaveLength(1)
    expect(letterSet(db, { mode: 'changed' }, true).records).toHaveLength(all.length)
  })
  it('brings back a held-back letter under "changed" once its lock is sorted out', async () => {
    const { db, ctx } = await allocatedDemo()
    const all = letterSet(db, { mode: 'all' }, true).records
    const held = all[0]!
    markNeedsNewCode(db, ctx, lockForLocker(db, held.lockerId)!.id)
    // Every other letter is printed.
    const printedIds = letterSet(db, { mode: 'all' }, true).records.map((r) => r.lockerId)
    ctx.advance(60_000)
    recordPrintJob(db, ctx, 'letters', printedIds)
    expect(letterSet(db, { mode: 'changed' }, true).records).toHaveLength(0)
    // The lock is reset and given a new code: its letter is due again.
    ctx.advance(60_000)
    markResetDone(db, ctx, lockForLocker(db, held.lockerId)!.id)
    issueCode(db, ctx, lockForLocker(db, held.lockerId)!.id, 'issued')
    const due = letterSet(db, { mode: 'changed' }, true).records.map((r) => r.lockerId)
    expect(due).toEqual([held.lockerId])
  })
  it('renders the preview of one letter with every code hidden', async () => {
    const { db } = await allocatedDemo()
    const p = prepareLetters(db, {
      selection: { mode: 'all' },
      language: { kind: 'one', code: 'en' },
      masked: true,
      preview: true,
      index: 2
    })
    expect(p.html.match(/<section class="letter"/g)).toHaveLength(1)
    expect(p.html).not.toMatch(/<span>\d<\/span>/)
  })
  it('uses each student’s own language when asked', async () => {
    const { db, ctx } = await allocatedDemo()
    const t = letterTemplate(db)
    const vi = { ...t, languages: [...t.languages, { code: 'vi', name: 'Tiếng Việt' }] }
    vi.blocks = vi.blocks.map((b) =>
      b.id === 'header' ? { ...b, heading: { ...b.heading, vi: 'Tủ đồ của em' } } : b
    )
    saveLetterTemplate(db, ctx, vi)
    const first = letterSet(db, { mode: 'all' }, true).records[0]!
    setStudentLanguage(db, ctx, first.studentId, 'vi')
    const p = prepareLetters(db, {
      selection: { mode: 'student', studentId: first.studentId },
      language: { kind: 'each' },
      masked: true,
      preview: false
    })
    expect(p.html).toContain('Tủ đồ của em')
  })
  it('keeps pictures in the file and drops them from sections when removed', async () => {
    const { db, ctx } = await allocatedDemo()
    const id = addImage(db, ctx, {
      name: 'Lock steps SYNTHETIC.png',
      mime: 'image/png',
      bytes: new Uint8Array([137, 80, 78, 71, 1, 2, 3]),
      width: 400,
      height: 200
    })
    const t = letterTemplate(db)
    saveLetterTemplate(db, ctx, {
      ...t,
      blocks: t.blocks.map((b) => (b.id === 'know' ? { ...b, imageId: id } : b))
    })
    expect(letterTemplate(db).blocks.find((b) => b.id === 'know')!.imageId).toBe(id)
    deleteImage(db, ctx, id)
    expect(letterTemplate(db).blocks.find((b) => b.id === 'know')!.imageId).toBeNull()
    expect(() =>
      saveLetterTemplate(db, ctx, {
        ...t,
        blocks: t.blocks.map((b) => (b.id === 'know' ? { ...b, imageId: id } : b))
      })
    ).toThrow(/picture/)
  })
})

describe('letters made in chunks, with progress and Cancel', () => {
  it('splits letters into chunks of 25 that together hold every letter once', async () => {
    const { db } = await allocatedDemo()
    const { chunks, prepared } = prepareLetterChunks(
      db,
      { selection: { mode: 'all' }, language: { kind: 'each' }, masked: true, preview: false },
      25
    )
    expect(prepared.items.length).toBeGreaterThan(200)
    expect(chunks).toHaveLength(Math.ceil(prepared.items.length / 25))
    const count = chunks.join('').split('<section class="letter"').length - 1
    expect(count).toBe(prepared.items.length)
    // Each chunk is a whole page of its own.
    for (const c of chunks) expect(c).toMatch(/^<!doctype html>/i)
  })

  async function onePagePdf(pages: number): Promise<Uint8Array> {
    const doc = await PDFDocument.create()
    for (let i = 0; i < pages; i++) doc.addPage([595, 842])
    return doc.save()
  }

  it('checks every chunk, then makes one PDF from them all, reporting progress', async () => {
    const seen: string[] = []
    const r = await runLetterJob(
      ['a', 'b', 'c'],
      {
        onProgress: (done, total, stage) => seen.push(`${stage} ${done}/${total}`),
        cancelled: () => false
      },
      { overflowing: async () => [], toPdf: async (html) => onePagePdf(html === 'b' ? 2 : 1) }
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect((await PDFDocument.load(r.bytes)).getPageCount()).toBe(4)
    expect(seen).toEqual([
      'checking 1/6',
      'checking 2/6',
      'checking 3/6',
      'making 4/6',
      'making 5/6',
      'making 6/6'
    ])
  })

  it('stops at the checking stage and names letters that run onto a second page', async () => {
    let made = 0
    const r = await runLetterJob(
      ['a', 'b'],
      { onProgress: () => undefined, cancelled: () => false },
      {
        overflowing: async (html) => (html === 'b' ? ['s-9'] : []),
        toPdf: async () => {
          made++
          return onePagePdf(1)
        }
      }
    )
    expect(r).toEqual({ ok: false, overflow: ['s-9'] })
    expect(made).toBe(0)
  })

  it('stops before the next chunk once Cancel is pressed', async () => {
    let cancel = false
    let made = 0
    const r = await runLetterJob(
      ['a', 'b', 'c'],
      {
        onProgress: (done) => {
          if (done === 4) cancel = true
        },
        cancelled: () => cancel
      },
      {
        overflowing: async () => [],
        toPdf: async () => {
          made++
          return onePagePdf(1)
        }
      }
    )
    expect(r).toEqual({ ok: false, cancelled: true })
    expect(made).toBe(1)
  })
})
