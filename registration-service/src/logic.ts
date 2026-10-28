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
  reviewLink,
  reviewPage,
  type Page
} from './pages'

export { reviewLink }

export interface Registration {
  id: string
  number: number
  name: string
  school: string
  email: string
  state: string
  role: string | null
  /** Anything the registrant chose to add. Rows made before notes existed have none. */
  notes: string | null
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

/** A registration before the store gives it its number and id (see `registrationId`). */
export type NewRegistration = Omit<Registration, 'id' | 'number'>

/** How many registrations may be saved, from one address in an hour and from everyone in a day. */
export interface Limits {
  perHourFromOneAddress: number
  mostPerDay: number
}

/** Recent registration times, kept in one document so the limits are checked in one step. */
export interface LimitsState {
  /** When each registration of the last 24 hours arrived. */
  recent: string[]
  /** When each registration of the last hour arrived, by `ipHash`. */
  byAddress: Record<string, string[]>
}

export type AddResult =
  { added: Registration; earlierToday: number } | { refused: 'address' | 'everyone' }

export interface Store {
  /**
   * Checks the limits and saves the registration in one step, so a burst of requests
   * sent together can never all pass the check before any of them is saved.
   * `earlierToday` is how many were saved in the 24 hours before this one.
   */
  addWithinLimits(r: NewRegistration, limits: Limits): Promise<AddResult>
  get(id: string): Promise<Registration | null>
  /** Every registration, newest first. */
  list(): Promise<Registration[]>
  /** Writes the patch only while the registration is still waiting, in one step. False if it was already decided. */
  claimDecision(id: string, patch: Partial<Registration>): Promise<boolean>
  /** Records that Dave was told the emails paused on this day (YYYY-MM-DD), in one step. False if he already was. */
  claimPauseAlert(day: string): Promise<boolean>
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
  /** Records a problem that was handled, such as an email that could not be sent. Never given a person's details. */
  warn?: (message: string) => void
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
const LIMITS: Limits = {
  perHourFromOneAddress: PER_HOUR_FROM_ONE_ADDRESS,
  mostPerDay: MOST_PER_DAY
}

/**
 * Line breaks become spaces in the one-line answers, so a name or school typed with a
 * line break can never add a line of its own to Dave's email, the pages or the key.
 */
const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim()

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

/**
 * The sender's internet address. Google adds the address it saw to the end of
 * X-Forwarded-For; anything before it is whatever the sender chose to put there, and
 * req.ip (the first entry) let anyone pick a new address for every request.
 */
export function senderAddress(
  forwardedFor: string | string[] | undefined,
  fallback: string
): string {
  const header = Array.isArray(forwardedFor) ? forwardedFor.join(',') : (forwardedFor ?? '')
  const last = header
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .pop()
  return last ?? fallback
}

/**
 * Whether one more registration fits the limits, and if so the state to save with it.
 * `stored` is the limits document as read, which may be missing or from an older version.
 */
export function checkLimits(
  stored: unknown,
  ipHash: string,
  createdAt: string,
  limits: Limits
): { refused: 'address' | 'everyone' } | { state: LimitsState; earlierToday: number } {
  const at = Date.parse(createdAt)
  const within = (ms: number, times: unknown): string[] =>
    (Array.isArray(times) ? times : []).filter(
      (t): t is string => typeof t === 'string' && Date.parse(t) >= at - ms
    )
  const doc =
    typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>) : {}
  const recent = within(DAY_MS, doc.recent)
  const byAddress: Record<string, string[]> = {}
  const addresses = doc.byAddress
  if (typeof addresses === 'object' && addresses !== null) {
    for (const [hash, times] of Object.entries(addresses)) {
      const kept = within(HOUR_MS, times)
      if (kept.length > 0) byAddress[hash] = kept
    }
  }
  const mine = byAddress[ipHash] ?? []
  if (mine.length >= limits.perHourFromOneAddress) return { refused: 'address' }
  if (recent.length >= limits.mostPerDay) return { refused: 'everyone' }
  return {
    state: {
      recent: [...recent, createdAt],
      byAddress: { ...byAddress, [ipHash]: [...mine, createdAt] }
    },
    earlierToday: recent.length
  }
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
  const form = parsed.data
  const result = await deps.store.addWithinLimits(
    {
      name: oneLine(form.name),
      school: oneLine(form.school),
      email: form.email,
      state: form.state,
      role: form.role ? oneLine(form.role) : null,
      notes: form.notes ? form.notes : null,
      source: form.source,
      appVersion: form.source === 'app' && form.appVersion ? oneLine(form.appVersion) : null,
      ipHash: hashAddress(ip, deps.adminToken),
      createdAt: now.toISOString(),
      status: 'waiting',
      reviewToken: randomBytes(32).toString('base64url'),
      decidedAt: null,
      key: null
    },
    LIMITS
  )
  if ('refused' in result) return { status: 429, json: { ok: false, error: 'too_many' } }
  const row = result.added

  // The registration is saved, so the sender is told it went through even if an email
  // fails: a retry would only save it twice. Dave finds it on the list page.
  const send = async (to: string, mail: { subject: string; text: string }): Promise<void> => {
    try {
      await deps.mailer.send(to, mail.subject, mail.text)
    } catch (err) {
      deps.warn?.(`an email about ${row.id} could not be sent: ${String(err)}`)
    }
  }
  if (result.earlierToday >= PER_DAY_FROM_EVERYONE) {
    // Tell Dave once a day, however many registrations arrive together, then stay quiet.
    if (await deps.store.claimPauseAlert(schoolDate(now))) {
      await send(deps.daveEmail, emailsPausedEmail())
    }
    return { status: 200, json: { ok: true } }
  }
  await send(deps.daveEmail, toDaveEmail(row, reviewLink(row, deps.baseUrl)))
  await send(row.email, receivedEmail())
  return { status: 200, json: { ok: true } }
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

  if (decision === 'reject') {
    // Claimed in one step, so a double-click or an overlapping Approve can never send a second email.
    if (!(await deps.store.claimDecision(row.id, { status: 'rejected', decidedAt }))) {
      return alreadyDecided((await deps.store.get(row.id)) ?? row, deps)
    }
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
  // Made first and saved with the decision in one step: a registration is never marked
  // approved without its key, and the key is saved before any email is tried.
  const key = signKey(details, deps.privateKey)
  if (!(await deps.store.claimDecision(row.id, { status: 'approved', decidedAt, key }))) {
    return alreadyDecided((await deps.store.get(row.id)) ?? row, deps)
  }
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
  const page = listPage(rows, deps.baseUrl)
  return { status: 200, body: page.html, contentType: 'text/html; charset=utf-8' }
}
