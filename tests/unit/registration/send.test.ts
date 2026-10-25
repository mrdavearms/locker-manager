import { describe, expect, it } from 'vitest'
import { registrationMailto, sendRegistration } from '../../../src/main/registration/send'
import { RegistrationMailtoSchema } from '../../../src/shared/ipc'
import {
  REGISTRATION_EMAIL,
  RegistrationFormSchema,
  type RegistrationForm
} from '../../../src/shared/registration'

const form: RegistrationForm = {
  name: 'Pat Example',
  school: "St Mary's & St Joseph's",
  email: 'pat@example.edu.au',
  state: 'VIC',
  role: 'Assistant principal',
  notes: 'We will use it for Year 7 lockers.',
  privacyAgreed: true
}

function reply(status: number, body: string, contentType: string): typeof fetch {
  return (async () =>
    new Response(body, { status, headers: { 'content-type': contentType } })) as typeof fetch
}

const deps = (f: typeof fetch, timeoutMs?: number) => ({
  fetch: f,
  url: 'https://registration.invalid/register',
  appVersion: '0.13.0',
  ...(timeoutMs === undefined ? {} : { timeoutMs })
})

describe('sendRegistration', () => {
  it('posts the form with source and app version, and returns ok', async () => {
    let seen: { url: string; init: RequestInit } | undefined
    const f = (async (url: string, init: RequestInit) => {
      seen = { url, init }
      return new Response('{"ok":true}', {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }) as unknown as typeof fetch
    expect(await sendRegistration(form, deps(f))).toEqual({ ok: true })
    expect(seen?.url).toBe('https://registration.invalid/register')
    expect(seen?.init.method).toBe('POST')
    const body = JSON.parse(seen?.init.body as string)
    expect(body).toMatchObject({ ...form, source: 'app', appVersion: '0.13.0' })
  })

  it('maps a network error to offline', async () => {
    const f = (async () => {
      throw new TypeError('fetch failed')
    }) as typeof fetch
    const r = await sendRegistration(form, deps(f))
    expect(r).toMatchObject({
      ok: false,
      reason: 'offline',
      message:
        "Locker Manager couldn't reach the registration service. Your school's network may be blocking it, or this computer is offline."
    })
  })

  it('maps a request that never answers to offline after the timeout', async () => {
    const f = ((_u: string, init: RequestInit) =>
      new Promise((_res, rej) => {
        init.signal?.addEventListener('abort', () => rej(new Error('aborted')))
      })) as unknown as typeof fetch
    const t = Date.now()
    const r = await sendRegistration(form, deps(f, 50))
    expect(r).toMatchObject({ ok: false, reason: 'offline' })
    expect(Date.now() - t).toBeLessThan(1000)
  })

  it('maps 403 and an HTML reply to blocked', async () => {
    const a = await sendRegistration(form, deps(reply(403, 'no', 'text/plain')))
    const b = await sendRegistration(form, deps(reply(200, '<html></html>', 'text/html')))
    for (const r of [a, b]) {
      expect(r).toMatchObject({
        ok: false,
        reason: 'blocked',
        message:
          "Your school's network blocked the registration. You can register on the website instead, or send it by email."
      })
    }
  })

  it('maps 429 to too_many and 500 to server', async () => {
    const a = await sendRegistration(form, deps(reply(429, '{}', 'application/json')))
    const b = await sendRegistration(form, deps(reply(500, '{}', 'application/json')))
    expect(a).toMatchObject({
      ok: false,
      reason: 'too_many',
      message:
        'Too many registrations have come from this network in the last hour. Try again later, or send it by email.'
    })
    expect(b).toMatchObject({
      ok: false,
      reason: 'server',
      message:
        'The registration service had a problem. Try again in a few minutes, or send it by email.'
    })
  })

  it('includes a mailto on every failure', async () => {
    const r = await sendRegistration(form, deps(reply(500, '{}', 'application/json')))
    expect(r.ok === false && r.mailto).toBe(registrationMailto(form, '0.13.0'))
  })
})

describe('registrationMailto', () => {
  it('encodes the subject and fields, one per line', () => {
    const m = registrationMailto(form, '0.13.0')
    expect(
      m.startsWith('mailto:dave@dandsarmstrong.com?subject=Locker%20Manager%20registration&body=')
    ).toBe(true)
    const body = decodeURIComponent(m.split('&body=')[1] ?? '')
    expect(body).toBe(
      [
        'Name: Pat Example',
        "School: St Mary's & St Joseph's",
        'Email: pat@example.edu.au',
        'State: VIC',
        'Role: Assistant principal',
        'Notes: We will use it for Year 7 lockers.',
        'App version: 0.13.0'
      ].join('\n')
    )
    expect(m).toContain(encodeURIComponent("St Mary's & St Joseph's").replace(/%20/g, '%20'))
    expect(m).not.toContain('+')
  })

  it('leaves out an empty role', () => {
    const m = registrationMailto({ ...form, role: '' }, '0.13.0')
    expect(decodeURIComponent(m)).not.toContain('Role:')
  })

  it('leaves out empty notes', () => {
    const m = registrationMailto({ ...form, notes: '' }, '0.13.0')
    expect(decodeURIComponent(m)).not.toContain('Notes:')
  })

  it('goes to the one registration address', () => {
    expect(REGISTRATION_EMAIL).toBe('dave@dandsarmstrong.com')
    expect(registrationMailto(form, '0.13.0').startsWith(`mailto:${REGISTRATION_EMAIL}?`)).toBe(
      true
    )
  })
})

describe('RegistrationMailtoSchema', () => {
  const ok = (url: string): boolean => RegistrationMailtoSchema.safeParse({ url }).success

  it('accepts the email main makes', () => {
    expect(ok(registrationMailto(form, '0.13.0'))).toBe(true)
  })

  it('refuses another address, a look-alike address, or extra fields', () => {
    expect(ok('mailto:someone@example.com?subject=a&body=b')).toBe(false)
    expect(ok('mailto:dave@dandsarmstrongxcom?subject=a&body=b')).toBe(false)
    expect(ok('mailto:dave@dandsarmstrong.com.evil.example?subject=a&body=b')).toBe(false)
    expect(ok('mailto:dave@dandsarmstrong.com?subject=a&body=b&cc=x@example.com')).toBe(false)
    expect(ok('mailto:dave@dandsarmstrong.com?cc=x@example.com&subject=a&body=b')).toBe(false)
    expect(ok('mailto:dave@dandsarmstrong.com,x@example.com?subject=a&body=b')).toBe(false)
    expect(ok('https://example.com/?subject=a&body=b')).toBe(false)
  })
})

describe('RegistrationFormSchema', () => {
  it('accepts a good form', () => {
    expect(RegistrationFormSchema.safeParse(form).success).toBe(true)
  })
  it('refuses privacyAgreed false and an email without @', () => {
    expect(RegistrationFormSchema.safeParse({ ...form, privacyAgreed: false }).success).toBe(false)
    expect(RegistrationFormSchema.safeParse({ ...form, email: 'pat.example.edu.au' }).success).toBe(
      false
    )
  })
})
