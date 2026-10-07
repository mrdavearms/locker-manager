import { describe, expect, it } from 'vitest'
import { handlers } from '../../src/main/rpc/handlers'
import { createDemoDatabase } from '../../src/main/demo/demoSchool'
import { testContext } from './helpers'

// "School details" ticks once the school has a name; a logo and colour stay optional.

describe('setup.status hasSchoolDetails', () => {
  it('is true for a named school with no logo and no colour', async () => {
    const ctx = testContext()
    const db = await createDemoDatabase(ctx, '0.9.0')
    const status = handlers['setup.status']
    if (status.kind !== 'read') throw new Error('wrong handler kind')
    db.run('UPDATE school SET logo = NULL, colour_primary = NULL, name = $n', {
      $n: 'SYNTHETIC Small School'
    })
    expect(status.run(db, {}).hasSchoolDetails).toBe(true)
  })

  it('is false when the name is blank', async () => {
    const ctx = testContext()
    const db = await createDemoDatabase(ctx, '0.9.0')
    const status = handlers['setup.status']
    if (status.kind !== 'read') throw new Error('wrong handler kind')
    db.run("UPDATE school SET name = '   '")
    expect(status.run(db, {}).hasSchoolDetails).toBe(false)
  })
})
