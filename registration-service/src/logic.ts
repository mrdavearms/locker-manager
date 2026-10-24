import { createHash, randomBytes, timingSafeEqual, type KeyObject } from 'node:crypto'
import { z } from 'zod'
// src/copied/ is written by `npm run registration:sync-key-format` at the repository root.
// Never edit those files here: edit the app's own files and run the script again.
import { signKey } from './copied/keyFormat'
import { RegistrationFormSchema, type RegistrationDetails } from './copied/registration'
import { emailsPausedEmail, keyEmail, receivedEmail, rejectEmail, toDaveEmail } from './mail'
import {
  decidedPage,
  listCsv,
  listFormPage,
  listPage,
  notFoundPage,
  reviewPage,
  type Page
} from './pages'

export interface Registration {
  id: string
  number: number
  name: string
  school: string
  email: string
  state: string
  role: string | null
  /** 'manual' is a key Dave made by hand with `npm run registration:make-key`. */
  source: 'app' | 'website' | 'manual'
  appVersion: string | null
  /** SHA-256 of the admin token, ':' and the sender's internet address. The address itself is never kept. */
  ipHash: string
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
  /** Writes the patch only while the registration is still waiting, in one step. False if it was already decided. */
  claimDecision(id: string, patch: Partial<Registration>): Promise<boolean>
  countRecentFromHash(ipHash: string, sinceMs: number): Promise<number>
  /** How many registrations were stored since this time, from any address. */
  countSince(sinceMs: number): Promise<number>
  /** Records that Dave was told the emails paused on this day (YYYY-MM-DD), in one step. False if he already was. */
  claimPauseAlert(day: string): Promise<boolean>
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
/**
 * Every registration sends two emails from Dave's mailbox. Past this many in a day the
 * service still saves registrations but stops emailing, well short of Gmail's daily limit.
 */
const PER_DAY_FROM_EVERYONE = 50
/** Past this many in a day the service stops saving registrations too, so a flood cannot fill the database. */
const MOST_PER_DAY = 500
const DAY_MS = 24 * HOUR_MS

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

/** Lets the hourly limit recognise a sender without keeping their internet address. */
export function hashAddress(ip: string, adminToken: string): string {
  return createHash('sha256').update(`${adminToken}:${ip}`, 'utf8').digest('hex')
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
  const ipHash = hashAddress(ip, deps.adminToken)
  const recent = await deps.store.countRecentFromHash(ipHash, now.getTime() - HOUR_MS)
  if (recent >= PER_HOUR_FROM_ONE_ADDRESS) {
    return { status: 429, json: { ok: false, error: 'too_many' } }
  }
  const today = await deps.store.countSince(now.getTime() - DAY_MS)
  if (today >= MOST_PER_DAY) {
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
    ipHash,
    createdAt: now.toISOString(),
    status: 'waiting',
    reviewToken: randomBytes(32).toString('base64url'),
    decidedAt: null,
    key: null
  })

  if (today >= PER_DAY_FROM_EVERYONE) {
    // Tell Dave once a day, however many registrations arrive together, then stay quiet.
    if (await deps.store.claimPauseAlert(schoolDate(now))) {
      const paused = emailsPausedEmail()
      await deps.mailer.send(deps.daveEmail, paused.subject, paused.text)
    }
    return { status: 200, json: { ok: true } }
  }

  const toDave = toDaveEmail(row, reviewLink(row, deps.baseUrl))
  await deps.mailer.send(deps.daveEmail, toDave.subject, toDave.text)
  const received = receivedEmail()
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
  if (row.status !== 'waiting') return alreadyDecided(row, deps)
  const now = deps.now()
  const decidedAt = now.toISOString()
  // Claimed in one step, so a double-click or an overlapping Reject can never send a second email.
  const status = decision === 'approve' ? 'approved' : 'rejected'
  if (!(await deps.store.claimDecision(row.id, { status, decidedAt }))) {
    return alreadyDecided((await deps.store.get(row.id)) ?? row, deps)
  }

  if (decision === 'reject') {
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
  await deps.store.update(row.id, { key })
  const approved: Registration = { ...row, status: 'approved', decidedAt, key }
  return sendThenShow(approved, keyEmail(approved, key), deps)
}

function alreadyDecided(row: Registration, deps: Deps): Page {
  return { ...reviewPage(row, deps.baseUrl), status: 409 }
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

/** The page that asks Dave for the admin token. It posts the token, so it never sits in an address or a log. */
export function handleListForm(deps: Deps): Page {
  return listFormPage(deps.baseUrl)
}

/** Answers the form's POST. */
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
  const page = listPage(rows)
  return { status: 200, body: page.html, contentType: 'text/html; charset=utf-8' }
}
