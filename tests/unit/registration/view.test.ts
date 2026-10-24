import { describe, expect, it } from 'vitest'
import type { RegistrationStatus } from '../../../src/main/registration/policy'
import { toRegistrationView } from '../../../src/main/registration/registration'

const registered: RegistrationStatus = {
  state: 'registered',
  source: 'file',
  key: 'LM1.abc.def',
  details: {
    v: 1,
    id: 'R-00012',
    school: 'SYNTHETIC Secondary College',
    name: 'Pat Example',
    email: 'pat@example.edu.au',
    issued: '2026-11-02',
    plan: 'free',
    expires: null
  }
}

describe('toRegistrationView', () => {
  it('shows the school, number, email and where the key came from', () => {
    expect(toRegistrationView(registered, true)).toEqual({
      state: 'registered',
      school: 'SYNTHETIC Secondary College',
      id: 'R-00012',
      email: 'pat@example.edu.au',
      source: 'file',
      enforced: true
    })
  })

  it('shows nothing about a school when unregistered', () => {
    expect(toRegistrationView({ state: 'unregistered' }, true)).toEqual({
      state: 'unregistered',
      school: null,
      id: null,
      email: null,
      source: null,
      enforced: true
    })
  })

  it('passes enforced through', () => {
    expect(toRegistrationView(registered, false).enforced).toBe(false)
    expect(toRegistrationView({ state: 'unregistered' }, false).enforced).toBe(false)
  })

  it('never hands the key itself to the window', () => {
    expect(JSON.stringify(toRegistrationView(registered, true))).not.toContain('LM1.')
  })
})
