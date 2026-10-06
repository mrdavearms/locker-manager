import { describe, expect, it } from 'vitest'
import { createDemoDatabase } from '../../src/main/demo/demoSchool'
import {
  exportSettings,
  importSettings,
  parseSettingsFile
} from '../../src/main/portable/settingsFile'
import { codeRules, setCodeRules } from '../../src/main/repos/codes'
import { addImage, letterTemplate, saveLetterTemplate } from '../../src/main/repos/letters'
import { getTerms, setTerms } from '../../src/main/repos/school'
import { setPin } from '../../src/main/privacy'
import { testContext } from './helpers'

describe('settings file (SPEC.md 7)', () => {
  it('carries the set-up to another school with no student data, PIN or codes', async () => {
    const ctx = testContext()
    const a = await createDemoDatabase(ctx, '0.8.0')
    setTerms(a, ctx, { ...getTerms(a), group: { one: 'Form', many: 'Forms' } })
    setCodeRules(a, ctx, { ...codeRules(a), length: 5 })
    setPin(a, ctx, '2468', null)
    const pic = addImage(a, ctx, {
      name: 'steps.png',
      mime: 'image/png',
      bytes: new Uint8Array([1, 2, 3]),
      width: 4,
      height: 2
    })
    const t = letterTemplate(a)
    saveLetterTemplate(a, ctx, {
      ...t,
      blocks: t.blocks.map((b) => (b.id === 'know' ? { ...b, imageId: pic } : b))
    })

    const text = JSON.stringify(exportSettings(a, '0.8.0', new Date()))
    for (const s of a.all<{ first_name: string }>('SELECT first_name FROM student LIMIT 20'))
      expect(text).not.toContain(`"${s.first_name}"`)
    expect(text).not.toContain('scrypt')
    expect(text).not.toContain('code_key')

    const b = await createDemoDatabase(testContext(), '0.8.0')
    const r = importSettings(b, ctx, parseSettingsFile(text))
    expect(r.pictures).toBe(1)
    expect(getTerms(b).group.one).toBe('Form')
    expect(codeRules(b).length).toBe(5)
    const know = letterTemplate(b).blocks.find((x) => x.id === 'know')!
    expect(know.imageId).not.toBeNull()
    expect(know.imageId).not.toBe(pic)
    expect(() => parseSettingsFile('{"format":"other"}')).toThrow(/not a Locker Manager/)
  })
})
