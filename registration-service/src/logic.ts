import { createHash, randomBytes, timingSafeEqual, type KeyObject } from 'node:crypto'
import { z } from 'zod'
// src/copied/ is written by `npm run registration:sync-key-format` at the repository root.
// Never edit those files here: edit the app's own files and run the script again.
import { signKey } from './copied/keyFormat'
import { RegistrationFormSchema, type RegistrationDetails } from './copied/registration'
import { keyEmail, receivedEmail, rejectEmail, toDaveEmail } from './mail'
import { decidedPage, listCsv, listPage, notFoundPage, reviewPage, type Page } from './pages'

export interface Registration {
  id: string
  number: number
  name: string
  school: string
  email: string
  state: string
  role: string | null
  source: 'app' | 'website'
  appVersion: string | null
  ip: string
  createdAt: string
  status: 'waiting' | 'approved' | 'rejected'
  reviewToken: string
  decidedAt: string | null
  key: string | null
}

/** A registration before the store gives it its id (see `registrationId`). */
export type NewRegistration = Omit<Registration, 'id'>

export interface Store {
  add(r: NewRegistration): Promise<Registration>
  get(id: string): Promise<Registration | null>
  update(id: string, patch: Partial<Registration>): Promise<void>
  /** Every registration, newest first. */
  list(): Promise<Registration[]>
  countRecentFrom(ip: string, sinceMs: number): Promise<number>
  nextNumber(): Promise<number>
}

export interface Mailer {
  send(to: string, subject: string, text: string): Promise<void>
}

export interface Deps {
  store: Store
  mailer: Mailer
  privateKey: KeyObject
  adminToken: string
  daveEmail: string
  /** Where the functions live, with no slash at the end, for example https://australia-southeast1-locker-manager-reg.cloudfunctions.net */
  baseUrl: string
  now: () => Date
}

const PER_HOUR_FROM_ONE_ADDRESS = 5
const HOUR_MS = 60 * 60 * 1000

/** What the app and the website send: the form, where it came from, and a hidden field only robots fill in. */
const PayloadSchema = RegistrationFormSchema.extend({
  source: z.enum(['app', 'website']),
  appVersion: z.string().trim().max(40).optional(),
  website: z.string().max(1000).optional()
})

export function registrationId(number: number): string {
  return `R-${String(number).padStart(5, '0')}`
}

/** Today's date in Victoria, as YYYY-MM-DD. The functions run on UTC clocks. */
export function schoolDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now)
}

/** Compares two secrets without leaking, through timing, how much of a guess was right. */
export function sameSecret(given: string, expected: string): boolean {
  if (expected === '') return false
  const a = createHash('sha256').update(given, 'utf8').digest()
  const b = createHash('sha256').update(expected, 'utf8').digest()
  return timingSafeEqual(a, b)
}

function filledHoneypot(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false
  const website = (body as { website?: unknown }).website
  return typeof website === 'string' && website.trim() !== ''
}

export async function handleRegister(
  body: unknown,
  ip: string,
  deps: Deps
): Promise<{ status: number; json: object }> {
  // A robot filled the hidden field: say thanks so it moves on, keep nothing.
  if (filledHoneypot(body)) return { status: 200, json: { ok: true } }
  const parsed = PayloadSchema.safeParse(body)
  if (!parsed.success) return { status: 400, json: { ok: false, error: 'invalid' } }
  const now = deps.now()
  const recent = await deps.store.countRecentFrom(ip, now.getTime() - HOUR_MS)
  if (recent >= PER_HOUR_FROM_ONE_ADDRESS) {
    return { status: 429, json: { ok: false, error: 'too_many' } }
  }

  const form = parsed.data
  const number = await deps.store.nextNumber()
  const row = await deps.store.add({
    number,
    name: form.name,
    school: form.school,
    email: form.email,
    state: form.state,
    role: form.role ? form.role : null,
    source: form.source,
    appVersion: form.source === 'app' && form.appVersion ? form.appVersion : null,
    ip,
    createdAt: now.toISOString(),
    status: 'waiting',
    reviewToken: randomBytes(32).toString('base64url'),
    decidedAt: null,
    key: null
  })

  const toDave = toDaveEmail(row, reviewLink(row, deps.baseUrl))
  await deps.mailer.send(deps.daveEmail, toDave.subject, toDave.text)
  const received = receivedEmail(row)
  await deps.mailer.send(row.email, received.subject, received.text)
  return { status: 200, json: { ok: true } }
}

export function reviewLink(row: Registration, baseUrl: string): string {
  const query = new URLSearchParams({ id: row.id, token: row.reviewToken })
  return `${baseUrl}/review?${query.toString()}`
}

async function findWithToken(id: string, token: string, deps: Deps): Promise<Registration | null> {
  const row = id ? await deps.store.get(id) : null
  if (!row || !sameSecret(token, row.reviewToken)) return null
  return row
}

/** Shows a registration to Dave. Changes nothing, so a mail scanner opening the link is harmless. */
export async function handleReview(id: string, token: string, deps: Deps): Promise<Page> {
  const row = await findWithToken(id, token, deps)
  if (!row) return notFoundPage()
  return reviewPage(row, deps.baseUrl)
}

export async function handleDecide(
  id: string,
  token: string,
  decision: 'approve' | 'reject',
  sendRejectEmail: boolean,
  deps: Deps
): Promise<Page> {
  const row = await findWithToken(id, token, deps)
  if (!row) return notFoundPage()
  if (row.status !== 'waiting') return { ...reviewPage(row, deps.baseUrl), status: 409 }
  const now = deps.now()
  const decidedAt = now.toISOString()

  if (decision === 'reject') {
    await deps.store.update(row.id, { status: 'rejected', decidedAt })
    const rejected: Registration = { ...row, status: 'rejected', decidedAt }
    if (!sendRejectEmail) return decidedPage(rejected, 'not_emailed')
    const mail = rejectEmail()
    return sendThenShow(rejected, mail, deps)
  }

  const details: RegistrationDetails = {
    v: 1,
    id: row.id,
    school: row.school,
    name: row.name,
    email: row.email,
    issued: schoolDate(now),
    plan: 'free',
    expires: null
  }
  const key = signKey(details, deps.privateKey)
  // Stored first, so a failed email never leaves Dave without the key.
  await deps.store.update(row.id, { status: 'approved', decidedAt, key })
  const approved: Registration = { ...row, status: 'approved', decidedAt, key }
  return sendThenShow(approved, keyEmail(approved, key), deps)
}

async function sendThenShow(
  row: Registration,
  mail: { subject: string; text: string },
  deps: Deps
): Promise<Page> {
  try {
    await deps.mailer.send(row.email, mail.subject, mail.text)
  } catch {
    return { ...decidedPage(row, 'email_failed'), status: 502 }
  }
  return decidedPage(row, 'emailed')
}

export async function handleList(
  adminToken: string,
  format: 'html' | 'csv',
  deps: Deps
): Promise<{ status: number; body: string; contentType: string }> {
  if (!sameSecret(adminToken, deps.adminToken)) {
    const page = notFoundPage()
    return { status: page.status, body: page.html, contentType: 'text/html; charset=utf-8' }
  }
  const rows = await deps.store.list()
  if (format === 'csv') {
    return { status: 200, body: listCsv(rows), contentType: 'text/csv; charset=utf-8' }
  }
  const csvQuery = new URLSearchParams({ token: adminToken, format: 'csv' })
  const page = listPage(rows, `${deps.baseUrl}/list?${csvQuery.toString()}`)
  return { status: 200, body: page.html, contentType: 'text/html; charset=utf-8' }
}
