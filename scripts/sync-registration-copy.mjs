#!/usr/bin/env node
// Copies the key format and the registration form rules into the registration service,
// so the service signs keys and checks forms exactly as the app does. Run after editing
// either file: npm run registration:sync-key-format
// tests/unit/registration/serviceCopy.test.ts fails if the copies fall behind.
import { readFileSync, writeFileSync } from 'node:fs'

const copies = [
  ['src/main/registration/keyFormat.ts', 'registration-service/src/copied/keyFormat.ts'],
  ['src/shared/registration.ts', 'registration-service/src/copied/registration.ts']
]

for (const [from, to] of copies) {
  const text = readFileSync(from, 'utf8').replaceAll("'@shared/registration'", "'./registration'")
  writeFileSync(to, text)
  console.log(`${from} -> ${to}`)
}
