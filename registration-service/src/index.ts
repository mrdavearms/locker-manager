// The four functions of the registration service (design section 8.1). All the decisions
// are in logic.ts, which is tested without Google; this file only connects them to
// Firestore, Gmail and the secrets.
import { createPrivateKey } from 'node:crypto'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, type Firestore, type UpdateData } from 'firebase-admin/firestore'
import { setGlobalOptions } from 'firebase-functions/v2'
import { onRequest, type Request } from 'firebase-functions/v2/https'
import { defineSecret, defineString } from 'firebase-functions/params'
import * as logger from 'firebase-functions/logger'
import type { Response } from 'express'
import {
  handleDecide,
  handleList,
  handleListForm,
  handleRegister,
  handleReview,
  registrationId,
  type Deps,
  type Registration,
  type Store
} from './logic'
import { REGISTRATION_EMAIL } from './copied/registration'
import { gmailMailer } from './mail'
import type { Page } from './pages'

initializeApp()
// Sydney, so staff details stay in Australia (design 8.1).
setGlobalOptions({ region: 'australia-southeast1', maxInstances: 2 })

const REG_SIGNING_KEY = defineSecret('REG_SIGNING_KEY') // Ed25519 private key, PKCS8 PEM
const GMAIL_USER = defineSecret('GMAIL_USER')
const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD')
const REG_ADMIN_TOKEN = defineSecret('REG_ADMIN_TOKEN')
/** Where these functions are reached, for example https://australia-southeast1-locker-manager-reg.cloudfunctions.net */
const BASE_URL = defineString('BASE_URL')
const secrets = [REG_SIGNING_KEY, GMAIL_USER, GMAIL_APP_PASSWORD, REG_ADMIN_TOKEN]

/** The Locker Manager website, which has its own registration form. */
const SITE_ORIGIN = 'https://mrdavearms.github.io'

const ID = /^R-\d{5,}$/

function firestoreStore(db: Firestore): Store {
  const registrations = db.collection('registrations')
  const counter = db.collection('counters').doc('registrations')
  const emailPause = db.collection('counters').doc('emailPause')
  return {
    async add(r) {
      const row: Registration = { ...r, id: registrationId(r.number) }
      await registrations.doc(row.id).create(row)
      return row
    },
    async get(id) {
      if (!ID.test(id)) return null
      const snap = await registrations.doc(id).get()
      return snap.exists ? (snap.data() as Registration) : null
    },
    async update(id, patch) {
      await registrations.doc(id).update(patch as UpdateData<Registration>)
    },
    async list() {
      const snap = await registrations.orderBy('number', 'desc').get()
      return snap.docs.map((d) => d.data() as Registration)
    },
    async claimDecision(id, patch) {
      const ref = registrations.doc(id)
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref)
        if (!snap.exists || snap.get('status') !== 'waiting') return false
        tx.update(ref, patch as UpdateData<Registration>)
        return true
      })
    },
    async countRecentFromHash(ipHash, sinceMs) {
      // One equality filter needs no extra Firestore index; the time is checked here.
      const snap = await registrations.where('ipHash', '==', ipHash).get()
      return snap.docs.filter((d) => Date.parse(String(d.get('createdAt'))) >= sinceMs).length
    },
    async countSince(sinceMs) {
      // createdAt is an ISO date, so text order is time order; a single-field filter needs no extra index.
      const since = new Date(sinceMs).toISOString()
      const snap = await registrations.where('createdAt', '>=', since).count().get()
      return snap.data().count
    },
    async claimPauseAlert(day) {
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(emailPause)
        if (snap.get('day') === day) return false
        tx.set(emailPause, { day })
        return true
      })
    },
    async nextNumber() {
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(counter)
        const next = Number(snap.get('last') ?? 0) + 1
        tx.set(counter, { last: next })
        return next
      })
    }
  }
}

let cached: Deps | undefined
function deps(): Deps {
  cached ??= {
    store: firestoreStore(getFirestore()),
    mailer: gmailMailer(GMAIL_USER.value(), GMAIL_APP_PASSWORD.value()),
    privateKey: createPrivateKey(REG_SIGNING_KEY.value()),
    adminToken: REG_ADMIN_TOKEN.value(),
    daveEmail: REGISTRATION_EMAIL,
    baseUrl: BASE_URL.value().replace(/\/+$/, ''),
    now: () => new Date()
  }
  return cached
}

const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  // The review and list addresses carry secrets: never pass them on to another site.
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function sendPage(res: Response, page: Page): void {
  res.status(page.status).set(PAGE_HEADERS).send(page.html)
}

function failed(res: Response, err: unknown, json: boolean): void {
  // The message only: never the form, which holds a person's details.
  logger.error('registration service failed', { message: String(err) })
  if (json) res.status(500).json({ ok: false, error: 'server' })
  else res.status(500).set(PAGE_HEADERS).send('<p>Something went wrong. Try again shortly.</p>')
}

export const register = onRequest({ secrets, cors: [SITE_ORIGIN] }, async (req: Request, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method' })
    return
  }
  try {
    const body: unknown = req.body
    // The address as the platform works it out. Task 11's live test checks it is the sender's.
    const result = await handleRegister(body, req.ip || 'unknown', deps())
    res.status(result.status).json(result.json)
  } catch (err) {
    failed(res, err, true)
  }
})

export const review = onRequest({ secrets }, async (req: Request, res) => {
  if (req.method !== 'GET') {
    res.status(405).end()
    return
  }
  try {
    sendPage(res, await handleReview(text(req.query.id), text(req.query.token), deps()))
  } catch (err) {
    failed(res, err, false)
  }
})

export const decide = onRequest({ secrets }, async (req: Request, res) => {
  if (req.method !== 'POST') {
    res.status(405).end()
    return
  }
  try {
    const body: unknown = req.body
    const form = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
    const decision = text(form.decision)
    if (decision !== 'approve' && decision !== 'reject') {
      res.status(400).set(PAGE_HEADERS).send('<p>Choose Approve or Reject.</p>')
      return
    }
    const page = await handleDecide(
      text(form.id),
      text(form.token),
      decision,
      text(form.sendRejectEmail) === 'yes',
      deps()
    )
    sendPage(res, page)
  } catch (err) {
    failed(res, err, false)
  }
})

// GET shows a form asking for the admin token; the form POSTs it, so it never sits in an
// address, the browser's history or the request logs.
export const list = onRequest({ secrets }, async (req: Request, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).end()
    return
  }
  try {
    if (req.method === 'GET') {
      sendPage(res, handleListForm(deps()))
      return
    }
    const body: unknown = req.body
    const form = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
    const format = text(form.format) === 'csv' ? 'csv' : 'html'
    const result = await handleList(text(form.token), format, deps())
    res.status(result.status).set(PAGE_HEADERS).set('Content-Type', result.contentType)
    if (format === 'csv' && result.status === 200)
      res.set('Content-Disposition', 'attachment; filename="locker-manager-registrations.csv"')
    res.send(result.body)
  } catch (err) {
    failed(res, err, false)
  }
})
