import { describe, expect, it } from 'vitest'
import { describeAction } from '../../src/shared/history'

describe('describeAction', () => {
  it('words the set-up "not used" actions and the quick start in plain English', () => {
    expect(describeAction('setup.item_not_used')).toBe('Set aside a getting-started item')
    expect(describeAction('setup.item_used')).toBe('Brought back a getting-started item')
    expect(describeAction('lockers.quick_start')).toBe('Added all the lockers in one step')
  })
})
