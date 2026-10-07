import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseGuide, parseInline } from '../../src/shared/markdown'
import { FOR_SCREEN, SHOW_ME } from '../../src/shared/guideLinks'

describe('the in-app guide reader', () => {
  it('reads bold, code and italics', () => {
    expect(parseInline('Click **Save** then `1.` and _then_ go')).toEqual([
      { kind: 'text', text: 'Click ' },
      { kind: 'bold', text: 'Save' },
      { kind: 'text', text: ' then ' },
      { kind: 'code', text: '1.' },
      { kind: 'text', text: ' and ' },
      { kind: 'em', text: 'then' },
      { kind: 'text', text: ' go' }
    ])
  })
  it('reads numbered steps with nested bullets and wrapped lines', () => {
    const g = parseGuide(
      '# T\n\n## A task\n\n1. First\n   step.\n2. Second:\n   - one\n   - two\n3. Third\n\nAfter.'
    )
    const s = g.sections[0]!
    expect(s.title).toBe('A task')
    const ol = s.blocks[0]!
    expect(ol.kind).toBe('ol')
    if (ol.kind !== 'ol') return
    expect(ol.items).toHaveLength(3)
    expect(ol.items[0]!.text).toEqual([{ kind: 'text', text: 'First step.' }])
    expect(ol.items[1]!.children?.items).toHaveLength(2)
    expect(s.blocks[1]).toEqual({ kind: 'p', text: [{ kind: 'text', text: 'After.' }] })
  })
  it('reads the whole user guide into sections', () => {
    const g = parseGuide(readFileSync('docs/user-guide.md', 'utf8'))
    expect(g.title).toBe('Locker Manager: user guide')
    expect(g.sections.length).toBeGreaterThan(40)
    expect(g.sections.map((s) => s.title)).toContain('Print letters')
    expect(new Set(g.sections.map((s) => s.id)).size).toBe(g.sections.length)
  })
  it('links every screen and Show me button to a section that exists', () => {
    const ids = new Set(
      parseGuide(readFileSync('docs/user-guide.md', 'utf8')).sections.map((s) => s.id)
    )
    const named = [...Object.keys(SHOW_ME), ...Object.values(FOR_SCREEN)]
    expect(named.filter((id) => !ids.has(id))).toEqual([])
    // The Guide opens at Getting started when no file is open: keep it first.
    expect([...ids][0]).toBe('getting-started')
  })
})
