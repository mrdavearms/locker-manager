#!/usr/bin/env node
// Refuses to commit anything that could be real student data or a secret.
//
//   node scripts/check-no-student-data.mjs            checks every tracked file
//   node scripts/check-no-student-data.mjs --staged   checks what is about to be committed (pre-commit hook)
//
// Rules (SPEC.md section 11):
//   1. Data files (.lockers, .csv, .xlsx, .xls, .ods) may live ONLY under tests/fixtures/ or
//      resources/demo/, and each must carry a SYNTHETIC marker: either in its file name or,
//      for text files, in its contents.
//   2. Certificates and keys (.p12, .pfx, .pem, .key, .cer, .mobileprovision) are never committed.
//   3. Text files must not contain things that look like tokens or private keys.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const staged = process.argv.includes('--staged')
const listArgs = staged ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR'] : ['ls-files']
const files = execFileSync('git', listArgs, { encoding: 'utf8' }).split('\n').filter(Boolean)

const DATA_EXT = /\.(lockers|csv|xlsx|xls|ods)$/i
const SECRET_EXT = /\.(p12|pfx|pem|key|cer|mobileprovision)$/i
const ALLOWED_DATA_DIRS = ['tests/fixtures/', 'resources/demo/']
const TEXT_LIKE = /\.(ts|tsx|js|mjs|cjs|json|yml|yaml|md|txt|csv|env|sh|ps1|html|css|plist)$/i

const SECRET_PATTERNS = [
  [/ghp_[A-Za-z0-9]{36}/, 'GitHub personal access token'],
  [/gho_[A-Za-z0-9]{36}/, 'GitHub OAuth token'],
  [/github_pat_[A-Za-z0-9_]{22,}/, 'GitHub fine-grained token'],
  [/AKIA[0-9A-Z]{16}/, 'AWS access key'],
  [/-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/, 'private key'],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [
    /(?:CSC_KEY_PASSWORD|AZURE_CLIENT_SECRET|APPLE_APP_SPECIFIC_PASSWORD)\s*[:=]\s*['"]?[^\s'"$#{]{8,}/,
    'signing secret value'
  ]
]

function readContent(file) {
  if (staged)
    return execFileSync('git', ['show', `:${file}`], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024
    })
  return readFileSync(file, 'utf8')
}

const problems = []
for (const file of files) {
  if (SECRET_EXT.test(file)) {
    problems.push(
      `${file}: certificate or key files are never committed. Use a GitHub Actions secret (docs/signing.md).`
    )
    continue
  }
  if (DATA_EXT.test(file)) {
    if (!ALLOWED_DATA_DIRS.some((d) => file.startsWith(d))) {
      problems.push(
        `${file}: data files may live only under ${ALLOWED_DATA_DIRS.join(' or ')}. Is this real student data?`
      )
      continue
    }
    const nameMarked = /synthetic/i.test(file)
    let contentMarked = false
    if (!nameMarked && /\.csv$/i.test(file)) {
      try {
        contentMarked = /SYNTHETIC/.test(readContent(file))
      } catch {
        contentMarked = false
      }
    }
    if (!nameMarked && !contentMarked) {
      problems.push(
        `${file}: fixture has no SYNTHETIC marker. Put SYNTHETIC in the file name (binary files) or in the contents (CSV).`
      )
    }
    continue
  }
  if (TEXT_LIKE.test(file) && !file.includes('node_modules/')) {
    let text
    try {
      text = readContent(file)
    } catch {
      continue
    }
    if (file === 'scripts/check-no-student-data.mjs') continue
    for (const [pattern, label] of SECRET_PATTERNS) {
      if (pattern.test(text)) problems.push(`${file}: looks like it contains a ${label}.`)
    }
  }
}

if (problems.length > 0) {
  console.error('\nRefusing to continue. These files look like student data or secrets:\n')
  for (const p of problems) console.error('  - ' + p)
  console.error(
    '\nIf a file is genuinely synthetic, move it under tests/fixtures/ and put SYNTHETIC in its name.\n'
  )
  process.exit(1)
}
console.log(`check-no-student-data: ${files.length} file(s) checked, nothing suspicious.`)
