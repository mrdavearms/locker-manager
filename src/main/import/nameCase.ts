// Names as imported, made readable (SPEC.md 4.2 and section 15, item 4).
// Student systems export surnames in capitals. Mc, O' and hyphens can be fixed by
// rule; Mac (MacDonald or Mackay?), particles and two-word surnames need a person.

const PARTICLES = new Set([
  'de',
  'del',
  'della',
  'der',
  'den',
  'di',
  'da',
  'das',
  'dos',
  'du',
  'la',
  'le',
  'van',
  'von',
  'ter',
  'ten',
  'bin',
  'binti',
  'al',
  'el'
])

export type NameFlag = 'mac' | 'particle' | 'two_word'

/** Unicode NFC, trimmed, single spaces, keeping accents. */
export function tidy(s: string | null | undefined): string {
  return (s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim()
}

function letters(s: string): string {
  return s.replace(/[^\p{L}]/gu, '')
}

/** True when the name is all capitals or all lower case, so its case carries no information. */
export function needsCaseFix(s: string): boolean {
  const l = letters(s)
  if (l.length < 2) return false
  return l === l.toLocaleUpperCase('en-AU') || l === l.toLocaleLowerCase('en-AU')
}

function cap(part: string): string {
  if (part.length === 0) return part
  const lower = part.toLocaleLowerCase('en-AU')
  return lower.charAt(0).toLocaleUpperCase('en-AU') + lower.slice(1)
}

function fixPart(part: string, flags: Set<NameFlag>): string {
  const lower = part.toLocaleLowerCase('en-AU')
  // O'Brien, D'Souza: a single letter, an apostrophe, then the name.
  const apos = /^(\p{L})(['’])(\p{L}.*)$/u.exec(part)
  if (apos) return `${apos[1]!.toLocaleUpperCase('en-AU')}${apos[2]}${cap(apos[3]!)}`
  if (/^mc\p{L}{2,}/u.test(lower)) return `Mc${cap(part.slice(2))}`
  if (/^mac\p{L}{3,}/u.test(lower)) {
    // MacDonald or Macdonald, Mackay or MacKay: do not guess (SPEC.md 4.2).
    flags.add('mac')
    return cap(part)
  }
  return cap(part)
}

export interface CasedName {
  value: string
  flags: NameFlag[]
}

/**
 * Converts a name from capitals (or all lower case) to name case. A name typed in
 * mixed case is kept exactly as it is: someone chose that spelling.
 */
export function toNameCase(
  raw: string,
  opts: { particles: 'lower' | 'capital'; isSurname: boolean }
): CasedName {
  const name = tidy(raw)
  if (!needsCaseFix(name)) return { value: name, flags: [] }
  const flags = new Set<NameFlag>()
  const words = name.split(' ')
  const out = words.map((word) => {
    const lower = word.toLocaleLowerCase('en-AU')
    if (opts.isSurname && words.length > 1 && PARTICLES.has(lower)) {
      flags.add('particle')
      // The first word of a surname on its own ("De La Rue" at the start) follows the school's choice too.
      return opts.particles === 'lower' ? lower : cap(word)
    }
    return word
      .split('-')
      .map((p) => fixPart(p, flags))
      .join('-')
  })
  if (opts.isSurname && words.length > 1 && !flags.has('particle')) flags.add('two_word')
  return { value: out.join(' '), flags: [...flags].sort() }
}

export const NAME_FLAG_TEXT: Record<NameFlag, string> = {
  mac: 'Mac name: check the capitals (MacDonald or Macdonald?)',
  particle: 'Surname with de, van, von and so on: check the capitals',
  two_word: 'Two-word surname: check the spelling and capitals'
}
