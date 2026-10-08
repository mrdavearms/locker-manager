import { describe, expect, it } from 'vitest'
import { codeKey, readCodeKey } from '../../src/main/codes/cipher'
import { summarise } from '../../src/main/db/summary'
import { makePracticeCopy } from '../../src/main/practice'
import { allocatedDemo } from './fixtures'
import { testContext } from './helpers'

function contains(haystack: Uint8Array, needle: string): boolean {
  return Buffer.from(haystack).includes(Buffer.from(needle, 'utf8'))
}

describe('practice copies (SPEC.md 10, decision 22)', () => {
  it('a copy made while editing keeps every code', async () => {
    const { db } = await allocatedDemo()
    const key = codeKey(db).toString('base64')
    const copy = await makePracticeCopy(db.export(), testContext(), { withCodes: true })
    expect(readCodeKey(copy)?.toString('base64')).toBe(key)
    expect(summarise(copy)).toMatchObject({ practice: true, practiceNoCodes: false })
    copy.close()
  })

  it('a copy made on a computer that is not editing has no codes and no way back to them', async () => {
    const { db } = await allocatedDemo()
    const key = codeKey(db).toString('base64')
    const ciphers = db
      .all<{ c: Uint8Array }>(
        'SELECT code_cipher AS c FROM code_set_entry UNION ALL SELECT code_cipher FROM lock WHERE code_cipher IS NOT NULL'
      )
      .map((r) => Buffer.from(r.c))
    const copy = await makePracticeCopy(db.export(), testContext(), { withCodes: false })
    expect(readCodeKey(copy)).toBeNull()
    const n = (sql: string) => copy.get<{ n: number }>(sql)!.n
    expect(n('SELECT COUNT(*) AS n FROM lock WHERE code_cipher IS NOT NULL')).toBe(0)
    expect(n('SELECT COUNT(*) AS n FROM lock WHERE master_code_cipher IS NOT NULL')).toBe(0)
    expect(n('SELECT COUNT(*) AS n FROM code_history WHERE code_cipher IS NOT NULL')).toBe(0)
    expect(n('SELECT COUNT(*) AS n FROM code_set_entry')).toBe(0)
    expect(n('SELECT COUNT(*) AS n FROM code_set WHERE seed IS NOT NULL')).toBe(0)
    expect(
      n("SELECT COUNT(*) AS n FROM lock WHERE code_status IN ('set','awaiting_physical_reset')")
    ).toBe(0)
    expect(summarise(copy)).toMatchObject({ practice: true, practiceNoCodes: true })
    // Nothing left in the file's free space either.
    const bytes = Buffer.from(copy.export())
    expect(contains(bytes, key)).toBe(false)
    expect(ciphers.filter((c) => bytes.includes(c))).toEqual([])
    copy.close()
  })
})
