// A small reader for the user guide's Markdown (SPEC.md 10: the guide in the app).
// It understands only what docs/user-guide.md uses: # and ## headings, paragraphs,
// - and 1. lists (nested by indenting), **bold**, _italics_ and `code`. Output is
// plain data turned into React elements, never raw HTML.

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'em'; text: string }
  | { kind: 'code'; text: string }

export interface ListItem {
  text: Inline[]
  children: ListBlock | null
}
export interface ListBlock {
  kind: 'ul' | 'ol'
  items: ListItem[]
}
export type Block = { kind: 'p'; text: Inline[] } | ListBlock

export interface Section {
  id: string
  title: string
  blocks: Block[]
  /** All the words, for searching. */
  plain: string
}

export interface Guide {
  title: string
  intro: Block[]
  sections: Section[]
}

export function parseInline(s: string): Inline[] {
  const out: Inline[] = []
  const re = /\*\*(.+?)\*\*|`([^`]+)`|(?<![A-Za-z0-9])_([^_]+)_(?![A-Za-z0-9])/g
  let last = 0
  for (const m of s.matchAll(re)) {
    if (m.index > last) out.push({ kind: 'text', text: s.slice(last, m.index) })
    if (m[1] !== undefined) out.push({ kind: 'bold', text: m[1] })
    else if (m[2] !== undefined) out.push({ kind: 'code', text: m[2] })
    else if (m[3] !== undefined) out.push({ kind: 'em', text: m[3] })
    last = m.index + m[0].length
  }
  if (last < s.length) out.push({ kind: 'text', text: s.slice(last) })
  return out
}

const LIST = /^(\s*)(-|\d+\.)\s+(.*)$/

function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = []
  let para: string[] = []
  const flush = (): void => {
    if (para.length) blocks.push({ kind: 'p', text: parseInline(para.join(' ')) })
    para = []
  }
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (line.trim() === '') {
      flush()
      i++
      continue
    }
    if (LIST.test(line)) {
      flush()
      const [list, next] = parseList(lines, i, LIST.exec(line)![1]!.length)
      blocks.push(list)
      i = next
      continue
    }
    para.push(line.trim())
    i++
  }
  flush()
  return blocks
}

function parseList(lines: string[], start: number, indent: number): [ListBlock, number] {
  const first = LIST.exec(lines[start]!)!
  const list: ListBlock = { kind: first[2] === '-' ? 'ul' : 'ol', items: [] }
  let i = start
  let text: string[] = []
  let current: ListItem | null = null
  const close = (): void => {
    if (current) current.text = parseInline(text.join(' '))
  }
  while (i < lines.length) {
    const line = lines[i]!
    if (line.trim() === '') {
      // A blank line ends the list unless the next line carries on at this depth or deeper.
      const nextLine = lines[i + 1]
      const nm = nextLine ? LIST.exec(nextLine) : null
      if (!nm || nm[1]!.length < indent) break
      i++
      continue
    }
    const m = LIST.exec(line)
    const lead = line.length - line.trimStart().length
    if (m && m[1]!.length === indent) {
      close()
      current = { text: [], children: null }
      list.items.push(current)
      text = [m[3]!]
      i++
    } else if (m && m[1]!.length > indent && current) {
      close()
      const [child, next] = parseList(lines, i, m[1]!.length)
      current.children = child
      i = next
    } else if (!m && lead > indent && current) {
      text.push(line.trim())
      i++
    } else break
  }
  close()
  return [list, i]
}

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export function parseGuide(md: string): Guide {
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  let title = ''
  const intro: string[] = []
  const sections: { title: string; lines: string[] }[] = []
  for (const line of lines) {
    if (line.startsWith('# ')) title = line.slice(2).trim()
    else if (line.startsWith('## ')) sections.push({ title: line.slice(3).trim(), lines: [] })
    else if (sections.length) sections[sections.length - 1]!.lines.push(line)
    else intro.push(line)
  }
  return {
    title,
    intro: parseBlocks(intro.filter((l) => !/^_Last updated/.test(l))),
    sections: sections.map((s) => ({
      id: slug(s.title),
      title: s.title,
      blocks: parseBlocks(s.lines),
      plain: `${s.title}\n${s.lines.join('\n')}`.toLowerCase()
    }))
  }
}
