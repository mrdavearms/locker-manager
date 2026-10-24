import { createHash, generateKeyPairSync, type KeyObject } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { checkKey } from '../src/copied/keyFormat'
import {
  handleDecide,
  handleList,
  handleListForm,
  handleRegister,
  handleReview,
  registrationId,
  type Deps,
  type Mailer,
  type NewRegistration,
  type Registration,
  type Store
} from '../src/logic'

class MemoryStore implements Store {
  rows = new Map<string, Registration>()
  counter = 0
  async add(r: NewRegistration): Promise<Registration> {
    const row = { ...r, id: registrationId(r.number) }
    this.rows.set(row.id, row)
    return row
  }
  async get(id: string): Promise<Registration | null> {
    return this.rows.get(id) ?? null
  }
  async update(id: string, patch: Partial<Registration>): Promise<void> {
    const row = this.rows.get(id)
    if (row) this.rows.set(id, { ...row, ...patch })
  }
  async list(): Promise<Registration[]> {
    return [...this.rows.values()].sort((a, b) => b.number - a.number)
  }
  async claimDecision(id: string, patch: Partial<Registration>): Promise<boolean> {
    const row = this.rows.get(id)
    if (!row || row.status !== 'waiting') return false
    this.rows.set(id, { ...row, ...patch })
    return true
  }
  async countRecentFromHash(ipHash: string, sinceMs: number): Promise<number> {
    return [...this.rows.values()].filter(
      (r) => r.ipHash === ipHash && Date.parse(r.createdAt) >= sinceMs
    ).length
  }
  async nextNumber(): Promise<number> {
    this.counter += 1
    return this.counter
  }
}

interface Sent {
  to: string
  subject: string
  text: string
}

class RecordingMailer implements Mailer {
  sent: Sent[] = []
  async send(to: string, subject: string, text: string): Promise<void> {
    this.sent.push({ to, subject, text })
  }
}

const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const pub: KeyObject = publicKey

let store: MemoryStore
let mailer: RecordingMailer
let deps: Deps
// 9 am in Melbourne on 2 November 2026, still 1 November in UTC.
const NOW = new Date('2026-11-01T22:00:00Z')

const good = {
  name: 'Hannah Smith',
  school: 'Example Secondary College',
  email: 'hsmith@example.vic.edu.au',
  state: 'VIC',
  role: 'Business manager',
  privacyAgreed: true,
  source: 'app',
  appVersion: '0.13.0'
}

beforeEach(() => {
  store = new MemoryStore()
  mailer = new RecordingMailer()
  deps = {
    store,
    mailer,
    privateKey,
    adminToken: 'admin-token-for-tests',
    daveEmail: 'dave@dandsarmstrong.com',
    baseUrl: 'https://example.invalid',
    now: () => NOW
  }
})

async function registerOne(body: object = good): Promise<Registration> {
  const res = await handleRegister(body, '203.0.113.5', deps)
  expect(res.status).toBe(200)
  const [row] = await store.list()
  if (!row) throw new Error('nothing stored')
  return row
}

describe('register', () => {
  it('stores a good registration as waiting and emails Dave and the registrant', async () => {
    const res = await handleRegister(good, '203.0.113.5', deps)
    expect(res).toEqual({ status: 200, json: { ok: true } })
    const row = await store.get('R-00001')
    expect(row).toMatchObject({
      number: 1,
      name: 'Hannah Smith',
      school: 'Example Secondary College',
      email: 'hsmith@example.vic.edu.au',
      state: 'VIC',
      role: 'Business manager',
      source: 'app',
      appVersion: '0.13.0',
      ipHash: createHash('sha256').update('admin-token-for-tests:203.0.113.5').digest('hex'),
      status: 'waiting',
      decidedAt: null,
      key: null
    })
    expect(JSON.stringify(row)).not.toContain('203.0.113.5')
    expect(row?.reviewToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(mailer.sent).toHaveLength(2)
    const [toDave, toThem] = mailer.sent
    expect(toDave?.to).toBe('dave@dandsarmstrong.com')
    expect(toDave?.subject).toBe('New Locker Manager registration: Example Secondary College')
    for (const text of [
      'Name: Hannah Smith',
      'School: Example Secondary College',
      'Email: hsmith@example.vic.edu.au',
      'State: VIC',
      'Role: Business manager',
      'Sent from: the app, version 0.13.0',
      `https://example.invalid/review?id=R-00001&token=${row?.reviewToken}`
    ])
      expect(toDave?.text).toContain(text)
    expect(toThem?.to).toBe('hsmith@example.vic.edu.au')
    expect(toThem?.subject).toBe("We've received your Locker Manager registration")
    expect(toThem?.text).toContain(
      'Thanks for registering Example Secondary College. Dave Armstrong checks each registration by hand, usually within a day. Your registration key will come to this address.'
    )
  })

  it('says "the website" when the form came from the website, and numbers each one', async () => {
    await handleRegister(good, '203.0.113.5', deps)
    mailer.sent = []
    const { appVersion: _, ...fromSite } = good
    await handleRegister({ ...fromSite, source: 'website', role: undefined }, '1.1.1.1', deps)
    expect(await store.get('R-00002')).toMatchObject({ role: null, appVersion: null })
    expect(mailer.sent[0]?.text).toContain('Sent from: the website')
    expect(mailer.sent[0]?.text).toContain('Role: (not given)')
  })

  it('refuses a bad email and sends nothing', async () => {
    const res = await handleRegister({ ...good, email: 'not an email' }, '203.0.113.5', deps)
    expect(res.status).toBe(400)
    expect(store.rows.size).toBe(0)
    expect(mailer.sent).toHaveLength(0)
  })

  it('refuses something that is not a form at all', async () => {
    expect((await handleRegister('hello', '203.0.113.5', deps)).status).toBe(400)
    expect((await handleRegister({ ...good, source: 'fax' }, '203.0.113.5', deps)).status).toBe(400)
  })

  it('answers a filled hidden field with ok but stores and sends nothing', async () => {
    const res = await handleRegister({ ...good, website: 'http://spam.example' }, '9.9.9.9', deps)
    expect(res).toEqual({ status: 200, json: { ok: true } })
    expect(store.rows.size).toBe(0)
    expect(mailer.sent).toHaveLength(0)
  })

  it('refuses the sixth registration from one address within an hour', async () => {
    for (let i = 0; i < 5; i++)
      expect((await handleRegister(good, '203.0.113.5', deps)).status).toBe(200)
    mailer.sent = []
    const res = await handleRegister(good, '203.0.113.5', deps)
    expect(res.status).toBe(429)
    expect(store.rows.size).toBe(5)
    expect(mailer.sent).toHaveLength(0)
    expect((await handleRegister(good, '198.51.100.7', deps)).status).toBe(200)
  })
})

describe('review', () => {
  it('shows nothing for a wrong token', async () => {
    const row = await registerOne()
    for (const [id, token] of [
      [row.id, 'wrong'],
      [row.id, ''],
      ['R-99999', row.reviewToken]
    ] as const) {
      const res = await handleReview(id, token, deps)
      expect(res.status).toBe(404)
      expect(res.html).not.toContain('Hannah')
      expect(res.html).not.toContain('Example Secondary')
    }
  })

  it('shows the details and two forms posting to decide, and changes nothing', async () => {
    const row = await registerOne()
    mailer.sent = []
    const res = await handleReview(row.id, row.reviewToken, deps)
    expect(res.status).toBe(200)
    for (const text of ['Hannah Smith', 'Example Secondary College', 'hsmith@example.vic.edu.au'])
      expect(res.html).toContain(text)
    const forms = res.html.match(/<form method="post" action="https:\/\/example.invalid\/decide">/g)
    expect(forms).toHaveLength(2)
    expect(res.html).toContain('name="decision" value="approve"')
    expect(res.html).toContain('name="decision" value="reject"')
    expect(res.html).toContain('name="sendRejectEmail"')
    expect(res.html).toContain(`name="token" value="${row.reviewToken}"`)
    expect((await store.get(row.id))?.status).toBe('waiting')
    expect(mailer.sent).toHaveLength(0)
  })

  it('escapes everything the registrant typed', async () => {
    const row = await registerOne({
      ...good,
      name: 'Bob "<b>" O\'Brien & Co',
      school: '<script>alert(1)</script> College'
    })
    const page = (await handleReview(row.id, row.reviewToken, deps)).html
    expect(page).not.toContain('<script>')
    expect(page).not.toContain('<b>')
    expect(page).toContain('&lt;script&gt;alert(1)&lt;/script&gt; College')
    expect(page).toContain('Bob &quot;&lt;b&gt;&quot; O&#39;Brien &amp; Co')
    const list = await handleList('admin-token-for-tests', 'html', deps)
    expect(list.body).not.toContain('<script>')
    expect(list.body).toContain('&lt;script&gt;alert(1)&lt;/script&gt; College')
  })
})

describe('decide', () => {
  it('approves: signs a key the app accepts, emails it and stores it', async () => {
    const row = await registerOne()
    mailer.sent = []
    const res = await handleDecide(row.id, row.reviewToken, 'approve', false, deps)
    expect(res.status).toBe(200)
    const stored = await store.get(row.id)
    expect(stored?.status).toBe('approved')
    expect(stored?.decidedAt).toBe(NOW.toISOString())
    const key = stored?.key ?? ''
    const check = checkKey(key, [pub], NOW)
    expect(check).toEqual({
      ok: true,
      details: {
        v: 1,
        id: 'R-00001',
        school: 'Example Secondary College',
        name: 'Hannah Smith',
        email: 'hsmith@example.vic.edu.au',
        issued: '2026-11-02',
        plan: 'free',
        expires: null
      }
    })
    expect(mailer.sent).toHaveLength(1)
    const [mail] = mailer.sent
    expect(mail?.to).toBe('hsmith@example.vic.edu.au')
    expect(mail?.subject).toBe('Your Locker Manager registration key for Example Secondary College')
    expect(mail?.text).toContain('1. Open Locker Manager.')
    expect(mail?.text).toContain('2. Choose "I have a key" (or Help, then Registration).')
    expect(mail?.text).toContain('3. Paste this key and press Register:')
    expect(mail?.text).toContain(`\n\n${key}\n\n`)
    expect(mail?.text).toContain(
      "This key covers every computer that opens your school's Locker Manager file."
    )
  })

  it('keeps the key and shows it to Dave when the key email fails', async () => {
    const row = await registerOne()
    deps.mailer = {
      send: async () => {
        throw new Error('Gmail said no')
      }
    }
    const res = await handleDecide(row.id, row.reviewToken, 'approve', false, deps)
    expect(res.status).toBe(502)
    const stored = await store.get(row.id)
    expect(stored?.status).toBe('approved')
    expect(res.html).toContain('The key could not be emailed')
    expect(res.html).toContain(stored?.key ?? 'missing key')
  })

  it('sends one key when Approve is pressed twice at once', async () => {
    const row = await registerOne()
    mailer.sent = []
    const results = await Promise.all([
      handleDecide(row.id, row.reviewToken, 'approve', false, deps),
      handleDecide(row.id, row.reviewToken, 'approve', false, deps)
    ])
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    expect(results.find((r) => r.status === 409)?.html).toContain('Already approved on')
    expect(mailer.sent).toHaveLength(1)
  })

  it('lets only one of an overlapping approve and reject win', async () => {
    const row = await registerOne()
    mailer.sent = []
    const results = await Promise.all([
      handleDecide(row.id, row.reviewToken, 'approve', false, deps),
      handleDecide(row.id, row.reviewToken, 'reject', true, deps)
    ])
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    const stored = await store.get(row.id)
    expect(mailer.sent).toHaveLength(1)
    expect(mailer.sent[0]?.subject).toBe(
      stored?.status === 'approved'
        ? 'Your Locker Manager registration key for Example Secondary College'
        : 'Your Locker Manager registration'
    )
  })

  it('refuses a second decision and says when the first was made', async () => {
    const row = await registerOne()
    await handleDecide(row.id, row.reviewToken, 'approve', false, deps)
    mailer.sent = []
    const again = await handleDecide(row.id, row.reviewToken, 'approve', false, deps)
    expect(again.status).toBe(409)
    expect(again.html).toContain('Already approved on 2 November 2026')
    const reject = await handleDecide(row.id, row.reviewToken, 'reject', true, deps)
    expect(reject.status).toBe(409)
    expect((await store.get(row.id))?.status).toBe('approved')
    expect(mailer.sent).toHaveLength(0)
    expect((await handleReview(row.id, row.reviewToken, deps)).html).toContain(
      'Already approved on 2 November 2026'
    )
  })

  it('refuses a wrong token and changes nothing', async () => {
    const row = await registerOne()
    mailer.sent = []
    const res = await handleDecide(row.id, 'x'.repeat(43), 'approve', false, deps)
    expect(res.status).toBe(404)
    expect((await store.get(row.id))?.status).toBe('waiting')
    expect(mailer.sent).toHaveLength(0)
  })

  it('rejects without an email unless asked', async () => {
    const row = await registerOne()
    mailer.sent = []
    const res = await handleDecide(row.id, row.reviewToken, 'reject', false, deps)
    expect(res.status).toBe(200)
    expect(await store.get(row.id)).toMatchObject({ status: 'rejected', key: null })
    expect(mailer.sent).toHaveLength(0)
  })

  it('rejects with one polite email when asked', async () => {
    const row = await registerOne()
    mailer.sent = []
    await handleDecide(row.id, row.reviewToken, 'reject', true, deps)
    expect(mailer.sent).toEqual([
      {
        to: 'hsmith@example.vic.edu.au',
        subject: 'Your Locker Manager registration',
        text: "Thanks for your interest in Locker Manager. I wasn't able to confirm this registration as a school. If you think this is a mistake, reply to this email.\n\nDave Armstrong\n"
      }
    ])
  })
})

describe('list', () => {
  it('shows nothing for a wrong admin token', async () => {
    await registerOne()
    for (const token of ['wrong', '']) {
      const res = await handleList(token, 'html', deps)
      expect(res.status).toBe(404)
      expect(res.body).not.toContain('Hannah')
    }
    expect((await handleList('', 'html', { ...deps, adminToken: '' })).status).toBe(404)
  })

  it('asks for the admin token in a form that posts it, never in the address', () => {
    const page = handleListForm(deps)
    expect(page.status).toBe(200)
    expect(page.html).toContain('<form method="post" action="https://example.invalid/list">')
    expect(page.html).toContain('type="password" name="token"')
    expect(page.html).toContain('name="format" value="html"')
    expect(page.html).toContain('name="format" value="csv"')
    expect(page.html).not.toContain('admin-token-for-tests')
  })

  it('lists every registration newest first, without the token or the address', async () => {
    await registerOne()
    await handleRegister({ ...good, school: 'Second School' }, '1.1.1.1', deps)
    const res = await handleList('admin-token-for-tests', 'html', deps)
    expect(res.status).toBe(200)
    expect(res.contentType).toBe('text/html; charset=utf-8')
    expect(res.body.indexOf('Second School')).toBeLessThan(
      res.body.indexOf('Example Secondary College')
    )
    expect(res.body).not.toContain('admin-token-for-tests')
    expect(res.body).not.toContain('format=csv')
    expect(res.body).not.toContain('203.0.113.5')
  })

  it('gives a CSV with a header row and spreadsheet formulas made harmless', async () => {
    await registerOne()
    await handleRegister(
      { ...good, name: '=HYPERLINK("x")', school: '+Plus School, "Quoted"', role: '-1' },
      '1.1.1.1',
      deps
    )
    await handleRegister({ ...good, school: '@Sum School' }, '1.1.1.2', deps)
    const res = await handleList('admin-token-for-tests', 'csv', deps)
    expect(res.status).toBe(200)
    expect(res.contentType).toBe('text/csv; charset=utf-8')
    const lines = res.body.replace(/^﻿/, '').trimEnd().split('\r\n')
    expect(lines).toHaveLength(4)
    expect(lines[0]).toBe('Number,Received,Name,School,Email,State,Role,Status,Decided,Sent from')
    expect(lines[1]).toContain(`R-00003,`)
    expect(lines[1]).toContain(`'@Sum School`)
    expect(lines[2]).toContain(`"'=HYPERLINK(""x"")"`)
    expect(lines[2]).toContain(`"'+Plus School, ""Quoted"""`)
    expect(lines[2]).toContain(`'-1`)
    expect(lines[3]).toContain('Example Secondary College')
    expect(res.body).not.toMatch(/[0-9a-f]{64}/)
    expect(res.body).not.toContain('203.0.113.5')
  })
})
