import type { MergeField } from '@shared/letters'
import { esc } from '../render/html'

// The words in a letter section (SPEC.md 5.2). Kept deliberately simple so office
// staff can write them in a plain box:
//   a blank line starts a new paragraph
//   "- " at the start of a line makes a bullet point; "1. " a numbered step
//   **two stars** around words make them bold
//   {locker} and the other merge fields in braces are filled in for each student

export type MergeValues = Record<MergeField, string>

function inline(escaped: string): string {
  return escaped.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
}

/**
 * Fills merge fields. Values are escaped; unknown fields are left as typed. Each
 * value is isolated from the words around it (<bdi>), so a name or number keeps
 * its own direction inside Arabic or Persian words, and the lock code always
 * reads left to right: "1 2 3 4", never "4 3 2 1" (print audit M2).
 */
function merge(html: string, values: Partial<MergeValues>): string {
  return html.replace(/\{([a-z_]+)\}/g, (whole, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) return whole
    const v = esc(values[key as MergeField] ?? '')
    if (v === '') return ''
    return key === 'code' ? `<bdi dir="ltr">${v}</bdi>` : `<bdi>${v}</bdi>`
  })
}

/** One line of words, with bold and merge fields, as HTML. */
export function formatLine(text: string, values: Partial<MergeValues>): string {
  return merge(inline(esc(text)), values)
}

/** Paragraphs, bullet points and numbered steps, as HTML. */
export function formatBody(text: string, values: Partial<MergeValues>): string {
  const out: string[] = []
  const paragraphs = text.replace(/\r\n?/g, '\n').split(/\n\s*\n/)
  for (const para of paragraphs) {
    const lines = para.split('\n').filter((l) => l.trim() !== '')
    if (lines.length === 0) continue
    let i = 0
    while (i < lines.length) {
      const line = lines[i]!
      const bullet = /^\s*[-•]\s+/.test(line)
      const numbered = /^\s*\d+[.)]\s+/.test(line)
      if (bullet || numbered) {
        const items: string[] = []
        const re = bullet ? /^\s*[-•]\s+/ : /^\s*\d+[.)]\s+/
        while (i < lines.length && re.test(lines[i]!)) {
          items.push(`<li>${formatLine(lines[i]!.replace(re, ''), values)}</li>`)
          i++
        }
        // Numbered steps keep the number typed first, so steps split by blank
        // lines run 1, 2, 3 instead of 1, 1, 1 (print audit M3).
        const first = Number(/^\s*(\d+)/.exec(lines[i - items.length]!)?.[1] ?? 1)
        const start = !bullet && first !== 1 ? ` start="${first}"` : ''
        out.push(bullet ? `<ul>${items.join('')}</ul>` : `<ol${start}>${items.join('')}</ol>`)
      } else {
        const plain: string[] = []
        while (i < lines.length && !/^\s*([-•]|\d+[.)])\s+/.test(lines[i]!)) {
          plain.push(formatLine(lines[i]!.trim(), values))
          i++
        }
        out.push(`<p>${plain.join('<br>')}</p>`)
      }
    }
  }
  return out.join('')
}

/** "1234" -> ["1","2","3","4"]; "12-34-05" -> ["12","34","05"]. */
export function codeParts(code: string): string[] {
  return code.includes('-') ? code.split('-') : code.split('')
}

/** Languages written right to left (by the code's first part: ar, fa, prs …). */
const RIGHT_TO_LEFT = new Set(['ar', 'fa', 'prs', 'ps', 'ur', 'he', 'yi', 'ckb', 'sd', 'ug', 'dv'])

export function isRightToLeft(lang: string): boolean {
  return RIGHT_TO_LEFT.has(lang.split('-')[0]!.toLowerCase())
}
