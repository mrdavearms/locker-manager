import { describe, expect, it } from 'vitest'
import { handlers } from '../../src/main/rpc/handlers'
import { createDemoDatabase } from '../../src/main/demo/demoSchool'
import { setSetting } from '../../src/main/repos/settings'
import { testContext } from './helpers'

// "We don't use this" on the getting-started list: labels and letters can be set aside.

describe('setup.notUsed', () => {
  it('starts empty, adds and removes items, and ignores repeats', async () => {
    const ctx = testContext()
    const db = await createDemoDatabase(ctx, '0.9.0')
    const status = handlers['setup.status']
    const write = handlers['setup.notUsed']
    if (status.kind !== 'read' || write.kind !== 'write') throw new Error('wrong handler kind')

    expect(status.run(db, {})).toMatchObject({ notUsed: [] })
    expect(write.run(db, ctx, { item: 'labels', notUsed: true }).notUsed).toEqual(['labels'])
    expect(write.run(db, ctx, { item: 'labels', notUsed: true }).notUsed).toEqual(['labels'])
    expect(write.run(db, ctx, { item: 'letters', notUsed: true }).notUsed).toEqual([
      'labels',
      'letters'
    ])
    expect(status.run(db, {}).notUsed).toEqual(['labels', 'letters'])
    expect(write.run(db, ctx, { item: 'labels', notUsed: false }).notUsed).toEqual(['letters'])
    expect(write.run(db, ctx, { item: 'letters', notUsed: false }).notUsed).toEqual([])
  })

  it('reads a damaged value as nothing set aside', async () => {
    const ctx = testContext()
    const db = await createDemoDatabase(ctx, '0.9.0')
    const status = handlers['setup.status']
    if (status.kind !== 'read') throw new Error('wrong handler kind')
    setSetting(db, ctx, 'setup.notUsed', ['printers'])
    expect(status.run(db, {}).notUsed).toEqual([])
  })
})
