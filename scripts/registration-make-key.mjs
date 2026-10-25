#!/usr/bin/env node
// Makes a registration key by hand (for a school Dave registers himself) and records it
// as an approved registration, so the numbers stay unique and the list stays complete.
//
//   npm run registration:make-key -- --school "..." --name "..." --email "..." [--expires YYYY-MM-DD]
//
// The private key is fetched from Google Secret Manager into memory only and never
// written to disk. Signing uses the same code as the registration service
// (registration-service/src/copied/keyFormat.ts), bundled in memory with esbuild.
//
// --dry-run --key-file <pem>   signs with a key from a file and touches neither
//                              Google Secret Manager nor Firestore (used by the unit test).
import { execFileSync } from 'node:child_process'
import { createPrivateKey, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const service = join(root, 'registration-service')
const USAGE =
  'Usage: npm run registration:make-key -- --school "School name" --name "Person name" --email person@school.vic.edu.au [--expires YYYY-MM-DD]'

function fail(message) {
  console.error(`${message}\n${USAGE}`)
  process.exit(1)
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') out.dryRun = true
    else if (['--school', '--name', '--email', '--expires', '--key-file'].includes(arg)) {
      const value = argv[++i]
      if (value === undefined || value.startsWith('--')) fail(`${arg} needs a value.`)
      out[arg.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = value.trim()
    } else fail(`Unknown argument: ${arg}`)
  }
  for (const f of ['school', 'name', 'email']) if (!out[f]) fail(`--${f} is required.`)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) fail('--email does not look like an email.')
  if (out.expires !== undefined) {
    const d = new Date(`${out.expires}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(out.expires) || d.toISOString().slice(0, 10) !== out.expires)
      fail('--expires must be a real date written YYYY-MM-DD.')
  }
  if (out.dryRun && !out.keyFile) fail('--dry-run needs --key-file.')
  if (out.keyFile && !out.dryRun) fail('--key-file is only for --dry-run.')
  return out
}

/** The service's own signing code, bundled in memory (no file written). */
async function loadSigner() {
  const result = await build({
    entryPoints: [join(service, 'src/copied/keyFormat.ts')],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    logLevel: 'silent'
  })
  const code = result.outputFiles[0].text
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
}

/** Melbourne's date as YYYY-MM-DD, as the service uses for `issued`. */
function schoolDate(now) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now)
}

function projectId() {
  const rc = JSON.parse(readFileSync(join(service, '.firebaserc'), 'utf8'))
  const id = rc.projects?.default
  if (!id) throw new Error('registration-service/.firebaserc has no default project.')
  return id
}

function fetchPrivateKeyPem(project) {
  return execFileSync(
    'gcloud',
    [
      'secrets',
      'versions',
      'access',
      'latest',
      '--secret=REG_SIGNING_KEY',
      `--project=${project}`,
      '--account=dave@dandsarmstrong.com'
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }
  )
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const { signKey } = await loadSigner()
  const now = new Date()
  const details = (id) => ({
    v: 1,
    id,
    school: args.school,
    name: args.name,
    email: args.email,
    issued: schoolDate(now),
    plan: 'free',
    expires: args.expires ?? null
  })

  if (args.dryRun) {
    const key = createPrivateKey(readFileSync(args.keyFile, 'utf8'))
    console.log(signKey(details('R-00000'), key))
    return
  }

  const project = projectId()
  const privateKey = createPrivateKey(fetchPrivateKeyPem(project))
  const requireFromService = createRequire(join(service, 'package.json'))
  const { initializeApp } = requireFromService('firebase-admin/app')
  const { getFirestore } = requireFromService('firebase-admin/firestore')
  initializeApp({ projectId: project })
  const db = getFirestore()
  const counter = db.collection('counters').doc('registrations')

  // Same counter as the service, so a hand-made id can never match a website one.
  const number = await db.runTransaction(async (tx) => {
    const snap = await tx.get(counter)
    const next = Number(snap.get('last') ?? 0) + 1
    tx.set(counter, { last: next })
    return next
  })
  const id = `R-${String(number).padStart(5, '0')}`
  const key = signKey(details(id), privateKey)
  await db
    .collection('registrations')
    .doc(id)
    .create({
      id,
      number,
      name: args.name,
      school: args.school,
      email: args.email,
      state: 'Not given',
      role: null,
      notes: null,
      source: 'manual',
      appVersion: null,
      ipHash: 'manual',
      createdAt: now.toISOString(),
      status: 'approved',
      reviewToken: randomBytes(32).toString('base64url'),
      decidedAt: now.toISOString(),
      key
    })
  console.error(`Recorded ${id} for ${args.school} as approved.`)
  console.log(key)
}

main().catch((err) => {
  console.error(`Could not make the key: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
