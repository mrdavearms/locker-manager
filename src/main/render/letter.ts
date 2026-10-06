import {
  PAGE_SIZES,
  type LetterBlock,
  type LetterRecord,
  type LetterTemplate,
  type Localised,
  type ShowFor
} from '@shared/letters'
import type { Terminology } from '@shared/terminology'
import { codeParts, formatBody, formatLine, type MergeValues } from '../letters/text'
import { fitText } from './fit'
import { fontFaceCss } from './fonts'
import { esc, mm } from './html'

// Student letters as HTML pages in millimetres (SPEC.md 5.2 and 5.3). One student
// per page: each letter is a page-sized box. The printing code measures every box
// and stops if any letter's content runs past the end of its page, then checks the
// PDF has exactly one page per letter.

export interface LetterSchool {
  name: string
  logo: string | null
  primary: string
  accent: string
  stripes: string[]
}

export interface LetterImage {
  dataUrl: string
  width: number
  height: number
}

export interface LetterBuildInput {
  template: LetterTemplate
  terms: Terminology
  school: LetterSchool
  images: ReadonlyMap<string, LetterImage>
  today: Date
  /** Preview: the page end is drawn and anything past it stays visible. */
  preview: boolean
}

export interface LetterItem {
  record: LetterRecord
  /** The code to print, or null for locks without one. */
  code: string | null
  /** Show dots instead of the code (on screen). */
  masked: boolean
  lang: string
}

export interface LetterOutput {
  html: string
  tooLong: string[]
}

const PAGE_PAD_X = 16
const PAGE_PAD_Y = 14
const NAME_BOX = { w: 108, h: 24 }

/** Words in a language, falling back to the template's first language, then any. */
export function pick(loc: Localised, lang: string, fallback: string): string {
  const v = loc[lang]
  if (v !== undefined && v.trim() !== '') return v
  const f = loc[fallback]
  if (f !== undefined && f.trim() !== '') return f
  return Object.values(loc).find((x) => x.trim() !== '') ?? ''
}

export function showsFor(show: ShowFor, kind: LetterRecord['kind']): boolean {
  switch (show) {
    case 'all':
      return true
    case 'code':
      return kind === 'settable' || kind === 'fixed'
    case 'settable':
      return kind === 'settable'
    case 'fixed':
      return kind === 'fixed'
    case 'keyed':
      return kind === 'keyed'
    case 'no_lock':
      return kind === 'no_lock'
  }
}

/** A pale tint of a colour, for panels. */
function tint(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16)
  const mix = (c: number): number => Math.round(c + (255 - c) * amount)
  const r = mix((n >> 16) & 255)
  const g = mix((n >> 8) & 255)
  const b = mix(n & 255)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

function pageCss(input: LetterBuildInput): string {
  const page = PAGE_SIZES[input.template.pageSize]
  const mono = input.template.colour === 'mono'
  const primary = mono ? '#000000' : input.school.primary
  const accent = mono ? '#000000' : input.school.accent
  const imageCss = [...input.images.entries()]
    .map(
      ([id, img]) => `.i-${id.replace(/[^a-zA-Z0-9_-]/g, '')}{background-image:url(${img.dataUrl})}`
    )
    .join('\n')
  return `${fontFaceCss()}
@page{size:${mm(page.width)} ${mm(page.height)};margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:${input.preview ? '#e9e6df' : '#fff'}}
body{font-family:LMArimo,Arial,sans-serif;color:#141414;font-size:11pt;line-height:1.4;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.letter{position:relative;width:${mm(page.width)};height:${mm(page.height)};padding:${mm(PAGE_PAD_Y)} ${mm(PAGE_PAD_X)};background:#fff;overflow:${input.preview ? 'visible' : 'hidden'};break-after:page;page-break-after:always}
.letter:last-child{break-after:auto;page-break-after:auto}
.pageend{position:absolute;left:0;right:0;top:${mm(page.height)};border-top:0.6mm dashed #c0392b;font-size:8pt;color:#c0392b;padding-top:1mm;text-align:center}
.hdr{display:flex;align-items:center;gap:6mm;margin:-${mm(PAGE_PAD_Y)} -${mm(PAGE_PAD_X)} 0;padding:9mm ${mm(PAGE_PAD_X)} 8mm;background:${mono ? '#fff' : primary};color:${mono ? '#000' : '#fff'};${mono ? 'border-bottom:0.6mm solid #000;' : ''}}
.hlogo{width:24mm;height:24mm;flex:none;background-size:contain;background-repeat:no-repeat;background-position:center}
.hschool{font-size:12pt;font-weight:700;opacity:.9}
.htitle{font-size:26pt;font-weight:700;line-height:1.1}
.hsub{font-size:11pt;margin-top:1mm;opacity:.9}
.stripe{margin:0 -${mm(PAGE_PAD_X)}}
.stripe div{height:2.2mm}
.student{display:flex;gap:6mm;margin-top:7mm;border:0.6mm solid ${primary};border-radius:3mm;padding:5mm 6mm}
.sname{flex:1;min-width:0}
.sname .n{font-weight:700;line-height:1.15;color:#000}
.sname .g{margin-top:1.5mm;font-size:11pt;color:#333}
.slock{flex:none;text-align:right}
.slock .w{font-size:9pt;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${primary}}
.slock .num{font-size:28pt;font-weight:700;line-height:1.05}
.code{display:flex;gap:1.6mm;justify-content:flex-end;margin-top:1mm}
.code span{display:flex;align-items:center;justify-content:center;min-width:10mm;height:12mm;padding:0 1.5mm;border:0.6mm solid ${primary};border-radius:1.6mm;font-size:20pt;font-weight:700}
.keyno{font-size:18pt;font-weight:700}
.block{margin-top:6mm;break-inside:avoid}
.block h2{margin:0 0 1.5mm;font-size:13pt;color:${primary}}
.block p{margin:0 0 2mm}
.block ul,.block ol{margin:0 0 2mm;padding-left:6mm}
.block li{margin:0 0 1mm}
.block > :last-child > :last-child{margin-bottom:0}
.panel{background:${mono ? '#f2f2f2' : tint(primary, 0.9)};border-radius:3mm;padding:4mm 5mm}
.help{border:0.6mm solid ${accent};background:${mono ? '#fff' : tint(accent, 0.88)};border-radius:3mm;padding:4mm 5mm}
.row{display:flex;gap:5mm;align-items:flex-start}
.row .txt{flex:1;min-width:0}
.pic{flex:none;background-size:contain;background-repeat:no-repeat;background-position:center}
.picblock{display:flex;justify-content:center}
.missing{border:0.4mm dashed #999;color:#777;font-size:9pt;display:flex;align-items:center;justify-content:center;text-align:center;padding:2mm}
${imageCss}`
}

function merges(input: LetterBuildInput, item: LetterItem): MergeValues {
  const r = item.record
  const code = item.code
    ? item.masked
      ? codeParts(item.code)
          .map(() => '•')
          .join(' ')
      : codeParts(item.code).join(' ')
    : ''
  return {
    first_name: r.firstName,
    last_name: r.lastName,
    full_name: `${r.firstName} ${r.lastName}`.trim(),
    group: r.group ?? '',
    year_level: r.yearLevel ?? '',
    locker: r.locker,
    bank: r.bank,
    area: r.area,
    code,
    lock_type: r.lockType,
    key_number: r.keyNumber ?? '',
    school: input.school.name,
    leader: input.terms.yearLevelLeader.one,
    office: input.terms.office.one,
    date: input.today.toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }),
    year: String(input.today.getFullYear())
  }
}

function picture(input: LetterBuildInput, imageId: string | null, widthMm: number): string {
  const img = imageId ? input.images.get(imageId) : undefined
  if (!imageId || !img) {
    return input.preview
      ? `<div class="pic missing" style="width:${mm(widthMm)};height:${mm(widthMm * 0.6)}">Choose a picture for this section</div>`
      : ''
  }
  const h = (widthMm * img.height) / img.width
  return `<div class="pic i-${imageId.replace(/[^a-zA-Z0-9_-]/g, '')}" style="width:${mm(widthMm)};height:${mm(h)}"></div>`
}

function studentPanel(
  input: LetterBuildInput,
  block: LetterBlock,
  item: LetterItem,
  lang: string,
  fallback: string,
  tooLong: string[]
): string {
  const r = item.record
  const labels = pick(block.body, lang, fallback).split('\n')
  const [lockerWord = input.terms.locker.one, codeLabel = '', keyLabel = '', noLock = ''] = labels
  const name = `${r.firstName} ${r.lastName}`.trim()
  const fitted = fitText(name, NAME_BOX, { max: 30, min: 14 }, 700)
  if (fitted.tooLong) tooLong.push(name)
  const groupLine = [
    r.group ? `${input.terms.group.one} ${r.group}` : null,
    r.yearLevel ? `${input.terms.yearLevel.one} ${r.yearLevel}` : null
  ]
    .filter(Boolean)
    .join(' · ')
  let lockPart = ''
  if ((r.kind === 'settable' || r.kind === 'fixed') && item.code) {
    const parts = codeParts(item.code)
    lockPart = `<div class="w" style="margin-top:3mm">${esc(codeLabel)}</div><div class="code">${parts
      .map((p) => `<span>${esc(item.masked ? '•' : p)}</span>`)
      .join('')}</div>`
  } else if (r.kind === 'keyed') {
    lockPart = `<div class="w" style="margin-top:3mm">${esc(keyLabel)}</div><div class="keyno">${esc(r.keyNumber ?? '—')}</div>`
  } else if (r.kind === 'no_lock') {
    lockPart = `<div class="g" style="margin-top:3mm;max-width:52mm">${esc(noLock)}</div>`
  }
  return `<div class="student"><div class="sname"><div class="n" style="font-size:${fitted.sizePt}pt">${fitted.lines
    .map((l) => esc(l))
    .join(
      '<br>'
    )}</div>${groupLine ? `<div class="g">${esc(groupLine)}</div>` : ''}</div><div class="slock"><div class="w">${esc(
    lockerWord
  )}</div><div class="num">${esc(r.locker)}</div>${lockPart}</div></div>`
}

function renderBlock(
  input: LetterBuildInput,
  block: LetterBlock,
  item: LetterItem,
  values: MergeValues,
  tooLong: string[]
): string {
  const lang = item.lang
  const fallback = input.template.languages[0]?.code ?? 'en'
  const heading = pick(block.heading, lang, fallback)
  const body = pick(block.body, lang, fallback)
  switch (block.type) {
    case 'header': {
      const logo = input.school.logo
      return `<div class="hdr">${logo ? `<div class="hlogo" style="background-image:url(${logo})"></div>` : ''}<div><div class="hschool">${esc(
        input.school.name
      )}</div><div class="htitle">${formatLine(heading, values)}</div>${
        body.trim() ? `<div class="hsub">${formatLine(body, values)}</div>` : ''
      }</div></div>`
    }
    case 'stripe': {
      const colours =
        input.template.colour === 'mono'
          ? ['#000000']
          : input.school.stripes.length > 0
            ? input.school.stripes
            : [input.school.accent]
      return `<div class="stripe">${colours.map((c) => `<div style="background:${esc(c)}"></div>`).join('')}</div>`
    }
    case 'student':
      return studentPanel(input, block, item, lang, fallback, tooLong)
    case 'space':
      return `<div style="height:${mm(block.size)}"></div>`
    case 'image':
      return `<div class="block picblock">${picture(input, block.imageId, block.size)}</div>`
    case 'text': {
      const words = `${heading.trim() ? `<h2>${formatLine(heading, values)}</h2>` : ''}${formatBody(body, values)}`
      const pic = block.imageId || input.preview ? picture(input, block.imageId, block.size) : ''
      const inner =
        block.imageId && pic
          ? `<div class="row">${block.imageSide === 'left' ? pic : ''}<div class="txt">${words}</div>${
              block.imageSide === 'right' ? pic : ''
            }</div>`
          : words
      const cls =
        block.tone === 'panel' ? 'block panel' : block.tone === 'help' ? 'block help' : 'block'
      return `<div class="${cls}">${inner}</div>`
    }
  }
}

/** Every letter as one HTML document, one page each. */
export function buildLetters(input: LetterBuildInput, items: readonly LetterItem[]): LetterOutput {
  const tooLong: string[] = []
  const pages = items.map((item) => {
    const values = merges(input, item)
    const blocks = input.template.blocks
      .filter((b) => showsFor(b.show, item.record.kind))
      .map((b) => renderBlock(input, b, item, values, tooLong))
      .join('')
    return `<section class="letter" data-student="${esc(item.record.studentId)}"><div class="content">${blocks}</div>${
      input.preview ? '<div class="pageend">The page ends here</div>' : ''
    }</section>`
  })
  const html = `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:"><title>Letters</title><style>${pageCss(
    input
  )}</style></head><body>${pages.join('')}</body></html>`
  return { html, tooLong }
}

export const LETTER_PAGE_PADDING = { x: PAGE_PAD_X, y: PAGE_PAD_Y }
