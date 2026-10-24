# Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Schools register Locker Manager (name, school, email), Dave approves each registration by email, and the school pastes a signed key that the app checks offline. Unregistered copies, including existing installs that update without a key, get the demo school and read-only access to existing files. There is no grace period (Dave, 25 October 2026).

**Architecture:** A key is an Ed25519-signed block of text (`LM1.<details>.<signature>`). The app holds only the public key and verifies with `node:crypto`, so nothing is sent to check a key. One pure function decides whether the copy is registered from the keys it can find (computer, IT's `registration.key` file, the open data file). The data file session gains one gate, `mayEdit(db)`, which opens a file read-only with the new reason `unregistered` and without taking the edit lock. A small Firebase project (`registration-service/` in this repo) receives registrations, emails Dave, and signs and emails keys on approval.

**Tech Stack:** Electron, React 19, TypeScript strict, Zod, sql.js, Vitest, fast-check, Playwright for Electron, `node:crypto` Ed25519, `semver` (already a dependency). Service: Firebase Cloud Functions v2 (Node.js 22), Firestore, Secret Manager, Nodemailer with a Gmail app password.

**Spec:** `docs/superpowers/specs/2026-10-24-registration-design.md`. Read it first; this plan argues from it.

## Global Constraints

- Australian English in all UI text, comments, docs and commit messages. No em-dashes in UI text. Plain English rules from CLAUDE.md for staff-facing words.
- Never hard-code "Homeroom", "Locker" and so on in UI text: use `useTerms()`. ("Locker Manager", the product name, comes from `brand.name`.)
- TypeScript strict, no `any`. Zod validates every new IPC payload in the main process.
- Pure modules (`src/main/registration/keyFormat.ts`, `policy.ts`) import nothing from Electron.
- No migration. The key lives in the existing `meta` table under `registration_v1`.
- Nothing about registration may stop an update, the self-test (except task 9's deliberate check), the update proofs, or the recovery page.
- The app sends registration details only when a person presses Send. It never sends anything to check a key.
- An unregistered copy can always open a school file read-only. It never takes the edit lock.
- Test-only environment variables (`LOCKER_MANAGER_REGISTRATION`, `LOCKER_MANAGER_REG_TEST_PUBKEY`) are ignored in an installed copy, using the same `installed()` test as `src/main/managed.ts`.
- No private key is ever committed, test or real. Tests generate a key pair at run time. `npm run check:no-student-data` must pass.
- No grace period. A copy is registered or unregistered, nothing else (Dave, 25 October 2026).
- Keys are emailed from `dave@dandsarmstrong.com`. The form asks for the school's state (drop-down).
- Conventional commits written for school staff, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Work on `main` in small commits (repo CLAUDE.md). Do not tag or release until task 13, and only after Dave says so.
- Before each commit: `npm run check`. End-to-end tests need `npm run build` first, then `npx playwright test tests/e2e/<file>`.
- Every outward step (creating the Firebase project, turning on billing, creating secrets, deploying, publishing the site, releasing) waits for Dave's go-ahead in chat. gcloud and firebase commands use `--account=dave@dandsarmstrong.com` / the `dave@` Firebase login.

## Review Focus

1. **A key pasted from an email with line breaks, spaces, or "smart" characters added by Outlook.** It must still be accepted. Task 1 strips all whitespace and zero-width characters before decoding; its test pastes a key broken over three lines with a leading tab and a trailing non-breaking space.
2. **An unregistered computer opening the shared school file while a registered colleague is editing it.** It must not take, steal or disturb the edit lock, and must not later "start editing" by itself when the lock frees. Task 4 tests that no lock file is written and that `canStartEditing` stays false through a poll tick.
3. **A backup restored from before the school registered.** The restored file has no key. A covered computer must put the key back; an uncovered one opens it read-only. Task 4 tests the first case; task 7 the second.
4. **The computer's clock is wrong (set years ahead or behind).** A wrong clock must never turn a registered copy unregistered while keys have no expiry. Task 2 tests that a key with `expires: null` stays valid at year 2100 and year 2000.
5. **The registration service is unreachable from a school network.** Send must fail within 15 seconds with a plain message and offer the website and email fallbacks, never a spinner that never ends. Task 6 tests a refused connection and a server that never answers.

---

### Task 1: The key format (sign and check)

**Files:**
- Create: `src/shared/registration.ts` (types and constants the window also uses)
- Create: `src/main/registration/keyFormat.ts` (pure, imports only `node:crypto`)
- Test: `tests/unit/registration/keyFormat.test.ts`

**Interfaces:**
- Produces, in `src/shared/registration.ts`:
  ```ts
  export interface RegistrationDetails {
    v: 1
    id: string          // 'R-00012'
    school: string
    name: string
    email: string
    issued: string      // 'YYYY-MM-DD'
    plan: 'free'
    expires: string | null  // 'YYYY-MM-DD' or null
  }
  export const KEY_PREFIX = 'LM1.'
  ```
- Produces, in `src/main/registration/keyFormat.ts`:
  ```ts
  export type KeyCheck =
    | { ok: true; details: RegistrationDetails }
    | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'unknown_version' }
  export function signKey(details: RegistrationDetails, privateKey: KeyObject): string
  export function checkKey(text: string, publicKeys: KeyObject[], now: Date): KeyCheck
  export function cleanKeyText(text: string): string
  ```
  `signKey` output: `LM1.` + base64url(UTF-8 JSON of details) + `.` + base64url(64-byte Ed25519 signature over the exact bytes of the middle part as ASCII). Use `crypto.sign(null, data, privateKey)` and `crypto.verify(null, data, key, sig)`. `checkKey` accepts a signature from any key in `publicKeys`. `expires` is compared as the end of that date in local time.

- [ ] **Step 1: Write the failing tests**

  In `tests/unit/registration/keyFormat.test.ts`, generate a pair with `generateKeyPairSync('ed25519')` in `beforeAll`. Tests:
  - `round-trips the details`: `checkKey(signKey(d, priv), [pub], now)` equals `{ ok: true, details: d }` for `d = { v: 1, id: 'R-00012', school: 'Example Secondary College', name: 'Hannah Smith', email: 'hsmith@example.vic.edu.au', issued: '2026-11-02', plan: 'free', expires: null }`.
  - `starts with LM1. and is under 400 characters` for the same `d`.
  - `accepts a key pasted with line breaks and odd spaces`: insert `\n` every 60 characters, prefix `\t`, suffix ` ​`; still `ok: true`.
  - `refuses a changed school name`: decode the middle part, change `school`, re-encode, keep the old signature; `reason: 'bad_signature'`.
  - `refuses a key signed by another key pair`: `reason: 'bad_signature'`.
  - `refuses rubbish`: `''`, `'LM1.'`, `'LM1.abc'`, `'hello'`, a valid key with `LM2.` prefix: each `reason: 'malformed'` (prefix wrong) or `'malformed'`.
  - `refuses version 2`: sign `{ ...d, v: 2 }` (cast); `reason: 'unknown_version'`.
  - `expiry`: `expires: '2027-03-31'` is ok on `new Date(2027, 2, 31, 23, 0)` and `'expired'` on `new Date(2027, 3, 1, 0, 1)`.
  - Property test (fast-check): for any school, name and email strings (including emoji and apostrophes), round-trip is ok; flipping any one character of the signature part gives `ok: false`.

- [ ] **Step 2: Run them and see them fail**

  Run: `npx vitest run tests/unit/registration/keyFormat.test.ts`
  Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/shared/registration.ts` and `src/main/registration/keyFormat.ts`**

  `cleanKeyText` removes every character matching `/[\s ​-‍﻿]/g`. `checkKey` validates the decoded JSON with a Zod schema (strict, exact field set above) before verifying; any parse failure is `malformed`. Keep `keyFormat.ts` free of anything but `node:crypto`, `zod` and the shared types: task 8 copies this file into the service.

- [ ] **Step 4: Run the tests and see them pass**

  Run: `npx vitest run tests/unit/registration/keyFormat.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add src/shared/registration.ts src/main/registration/keyFormat.ts tests/unit/registration/keyFormat.test.ts
  git commit -m "feat(registration): signed registration keys that the app checks offline"
  ```

---

### Task 2: Is this copy registered

**Files:**
- Create: `src/main/registration/policy.ts` (pure)
- Test: `tests/unit/registration/policy.test.ts`

**Interfaces:**
- Consumes: `checkKey`, `RegistrationDetails` (task 1).
- Produces:
  ```ts
  export type RegistrationSource = 'computer' | 'it' | 'file'
  export type RegistrationStatus =
    | { state: 'registered'; details: RegistrationDetails; source: RegistrationSource; key: string }
    | { state: 'unregistered' }
  export interface PolicyInput {
    computerKey: string | null
    itKey: string | null
    fileKey: string | null
    publicKeys: KeyObject[]
    now: Date
  }
  export function registrationStatus(input: PolicyInput): RegistrationStatus
  export function keysAfterOpen(input: {
    fileKey: string | null; computerKey: string | null; itKey: string | null
    mode: 'edit' | 'read_only'; publicKeys: KeyObject[]; now: Date
  }): { saveToComputer: string | null; writeToFile: string | null }
  ```
  Order of keys checked: `it`, then `computer`, then `file`; the first valid one wins. `keysAfterOpen` (design 6.5): `saveToComputer` is the file's key when it is valid and the computer has no valid key; `writeToFile` is the computer's (or else IT's) valid key when the mode is `edit` and the file has no valid key. A valid key is never replaced.

- [ ] **Step 1: Write the failing tests**

  Table-driven tests in `policy.test.ts`, keys made with task 1's `signKey` and a run-time pair:
  - valid computer key, nothing else: `registered`, `source: 'computer'`.
  - invalid IT key plus valid file key: `registered`, `source: 'file'`.
  - valid IT key and valid computer key: `source: 'it'`.
  - no key: `{ state: 'unregistered' }`. An expired key only: `unregistered`.
  - clock: a key with `expires: null` is `registered` at `new Date(2100, 0, 1)` and `new Date(2000, 0, 1)`.
  - `keysAfterOpen`: file key valid, computer none: saves the file key to the computer. File none, computer valid, edit: writes the computer key to the file. Same in read-only: writes nothing. File key A and computer key B both valid: nothing changes. File key invalid, computer valid, edit: writes the computer key.

- [ ] **Step 2: Run them and see them fail**

  Run: `npx vitest run tests/unit/registration/policy.test.ts`
  Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/main/registration/policy.ts`**

- [ ] **Step 4: Run the tests and see them pass**

  Run: `npx vitest run tests/unit/registration/policy.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add src/main/registration/policy.ts tests/unit/registration/policy.test.ts
  git commit -m "feat(registration): decide whether a copy is registered from the keys it finds"
  ```

---

### Task 3: Where keys are kept, and the registration service in the main process

**Files:**
- Modify: `src/main/prefs/preferences.ts` (one new field)
- Modify: `src/main/managed.ts` (read `registration.key`)
- Create: `src/main/registration/fileKey.ts` (meta helpers, Electron-free)
- Create: `src/main/registration/registration.ts` (Electron glue: public keys, current status, enter a key)
- Test: `tests/unit/registration/storage.test.ts`, additions to `tests/unit/preferences.test.ts`

**Interfaces:**
- Consumes: tasks 1 and 2.
- Produces:
  - `PrefsSchema` gains `registrationKey: string | null` (default null, `.catch(null)`).
  - In `managed.ts`: `export function registrationKeyPath(platform?, packaged?): string` (same folder as `managedPath`, file `registration.key`, test override `LOCKER_MANAGER_MANAGED_DIR` only when not installed) and `export function readItRegistrationKey(): string | null` (whole file text, BOM removed, trimmed; null when missing or unreadable).
  - In `fileKey.ts`: `export const FILE_KEY_META = 'registration_v1'`, `export function readFileKey(db: LockerDb): string | null`, and `export function writeFileKey(db: LockerDb, key: string): void` (uses `getMeta`/`setMeta` from `src/main/db/context.ts`).
  - In `registration.ts`:
    ```ts
    export function publicKeys(): KeyObject[]
    export function enforced(): boolean
    export function statusFor(db: LockerDb | null): RegistrationStatus
    export async function enterKey(text: string): Promise<{ ok: true; status: RegistrationStatus } | { ok: false; message: string }>
    export const PRODUCTION_PUBLIC_KEY: string | null   // base64 SPKI DER; null until task 11
    ```
    `publicKeys()` returns the production key when set, plus the test key from `LOCKER_MANAGER_REG_TEST_PUBKEY` when not installed. `enforced()` is true in an installed copy; when not installed it is true only if `LOCKER_MANAGER_REGISTRATION=enforce`. When not enforced, `statusFor` returns `registered` with `details.school = 'Development copy'`, `id = 'DEV'`, `source: 'computer'`, so `npm run dev` and every existing e2e test behave as today. `enterKey` checks with `checkKey`, saves to `prefs.registrationKey`, and returns a staff-facing message for each failure reason (wording in task 5).

- [ ] **Step 1: Write the failing tests**
  - `storage.test.ts`: `writeFileKey` then `readFileKey` on a fresh `createNewDatabase` returns the key; `readFileKey` on a file without one returns null.
  - `storage.test.ts`: `readItRegistrationKey` with `LOCKER_MANAGER_MANAGED_DIR` pointing at a temp folder: missing file gives null; file `"﻿LM1.abc\r\n"` gives `'LM1.abc'`.
  - `preferences.test.ts`: an old `preferences.json` without the new fields loads with `registrationKey: null`; a file with `registrationKey: 42` keeps the operator name and reads `null`.

- [ ] **Step 2: Run them and see them fail**

  Run: `npx vitest run tests/unit/registration tests/unit/preferences.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement the files above**

  Leave `PRODUCTION_PUBLIC_KEY = null` with a comment pointing to task 11.

- [ ] **Step 4: Run the tests and see them pass**

  Run: `npm run check`
  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add src/main/prefs/preferences.ts src/main/managed.ts src/main/registration tests/unit
  git commit -m "feat(registration): keep the key on the computer, in the school's file, or from IT"
  ```

---

### Task 4: The data file opens read-only for an unregistered copy

**Files:**
- Modify: `src/shared/fileState.ts` (`ReadOnlyReason` gains `'unregistered'`)
- Modify: `src/main/file/session.ts` (`open`, the poll tick, `startEditing`)
- Modify: `src/main/fileService.ts` (pass the gate; refuse new, practice and from-export when unregistered; copy keys between file and computer after open)
- Test: `tests/unit/file/registrationGate.test.ts`

**Interfaces:**
- Consumes: `statusFor`, `readFileKey`, `writeFileKey`, `enforced` (task 3).
- Produces:
  - Session deps gain `mayEdit?: (db: LockerDb) => boolean` (missing means always true, so existing tests are untouched).
  - In `open()`, after the integrity check and before `observeLock`/`acquireLock`: if `mayEdit(db)` is false, set `c.readOnly = { reason: 'unregistered', holder: null, canTakeOver: false, canStartEditing: false }`, skip the lock entirely, and keep the existing read-only behaviour for an older schema.
  - The poll tick must never set `canStartEditing` (or `canTakeOver`) on a file whose reason is `unregistered`.
  - `fileService.ts` passes `mayEdit: (db) => statusFor(db).state !== 'unregistered'`.
  - `fileService.ts` exports `async function reopenAfterRegistration(): Promise<ActionResult>`: if a file is open read-only for `unregistered`, `session.open(samePath)`; otherwise a no-op success.
  - After any successful open (`afterOpen`): if the file has a valid key and the computer has no valid key, save the file's key to `prefs.registrationKey`. If the session is in edit mode, the file has no valid key, and `statusFor(db)` is registered from `computer` or `it`, write it with `session.write({ action: 'registration.added', entity: 'file' }, (db) => writeFileKey(db, key))`. No replay function: a conflict merge may drop it, and the next open puts it back. Never replace a valid key already in the file or on the computer (design 6.5).
  - `fileOpenBackup` is gated like `fileNew` (it writes over the school's file; design 7.4).
  - `fileNew`, `filePractice`, `fileFromExport`, `fileOpenBackup` return `{ ok: false, message: 'Register Locker Manager first. You can still try the demo school.', needsRegistration: true }` when `statusFor(null).state === 'unregistered'` and enforced. Add optional `needsRegistration?: boolean` to `ActionResult` in `src/shared/ipc.ts`.
  - The demo (`fileOpenDemo`) is never gated. A demo file is opened with `mayEdit` returning true (check `getMeta(db, 'demo') === '1'` first).

- [ ] **Step 1: Write the failing tests** (`registrationGate.test.ts`, using the existing session test helpers in `tests/unit/file/`, read one to copy its set-up)
  - `opens read-only without taking the lock when mayEdit is false`: state is `read_only`, reason `unregistered`, and the lock file beside the data file does not exist.
  - `does not disturb a colleague's lock`: a lock held by another session stays held, with unchanged contents, after the unregistered open and two poll ticks; `canStartEditing` stays false.
  - `refuses a write`: `session.write(...)` on the unregistered file throws the existing read-only error.
  - `opens for editing when mayEdit is true`: unchanged behaviour.
  - `puts the computer's key back into a restored file`: create a file, open with a gate that is true and a computer key set, assert `readFileKey` after the debounced save is the computer key and History has `registration.added`.
  - `never replaces a key already in the file`: a file holding valid key A, opened by a computer holding valid key B, still holds key A, and the computer still holds key B.

  These afterOpen rules call `keysAfterOpen` (task 2); this test proves `fileService.ts` acts on its answer.

- [ ] **Step 2: Run them and see them fail**

  Run: `npx vitest run tests/unit/file/registrationGate.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement the changes above**

- [ ] **Step 4: Run all unit tests**

  Run: `npm run check`
  Expected: PASS, including every existing session test.

- [ ] **Step 5: Commit**

  ```bash
  git add src/shared/fileState.ts src/shared/ipc.ts src/main/file/session.ts src/main/fileService.ts tests/unit/file/registrationGate.test.ts
  git commit -m "feat(registration): an unregistered copy can look at a school's file but not change it"
  ```

---

### Task 5: Registration screens

**Files:**
- Modify: `src/shared/channels.ts`, `src/shared/ipc.ts`, `src/preload/index.ts`
- Create: `src/main/registration/ipc.ts` (handlers; registered where `registerFileHandlers` is called in `src/main/index.ts`)
- Create: `src/renderer/src/components/RegistrationDialog.tsx` (two tabs: Register, I have a key)
- Modify: `src/renderer/src/screens/WelcomeScreen.tsx`, `src/renderer/src/components/ReadOnlyBanner.tsx`, `src/renderer/src/components/AboutDialog.tsx`, `src/renderer/src/components/NewFileDialog.tsx`, `src/renderer/src/App.tsx`, `src/main/menu.ts`
- Test: `tests/e2e/registration.spec.ts` (written in task 7; this task checks by unit test and by hand in `npm run dev` with `LOCKER_MANAGER_REGISTRATION=enforce`)

**Interfaces:**
- Consumes: tasks 3 and 4; `sendRegistration` (task 6) through the `registrationSend` channel. Build the Send tab against the channel; task 6 fills the handler.
- Produces:
  - Channels: `registrationGet: 'registration:get'`, `registrationEnterKey: 'registration:enterKey'`, `registrationSend: 'registration:send'`, `registrationChanged: 'registration:changed'` (main to window), `openRegistration: 'registration:open'` (menu to window).
  - `RegistrationView` in `src/shared/ipc.ts`: `{ state: 'registered' | 'unregistered'; school: string | null; id: string | null; email: string | null; source: RegistrationSource | null; enforced: boolean }`. Dates shown with the app's usual date format (6 Oct 2026).
  - `window.api.getRegistration(): Promise<RegistrationView>`, `enterRegistrationKey(key: string): Promise<{ ok: true; view: RegistrationView } | { ok: false; message: string }>`, `sendRegistration(form: RegistrationForm): Promise<SendResult>` (task 6 types), `onRegistrationChanged(cb)`.
  - After a key is accepted: main calls `reopenAfterRegistration()` and sends `registrationChanged`.
  - Help menu gains `Registration…` after `Check for updates…`.
  - Test ids: `register-button`, `have-key-button`, `registration-dialog`, `key-input`, `key-submit`, `key-message`, `registered-to`.
- Exact staff-facing words (Plain English; the implementer may adjust layout, not meaning):
  - Welcome, unregistered: heading "Register Locker Manager", text "Locker Manager is free for schools. Register once and every computer that opens your school's file is covered. Until then you can try the demo school." Buttons "Register this school", "I have a key", "Try the demo school".
  - Read-only banner, reason `unregistered`: "This copy of Locker Manager is not registered, so you can look but not change anything." Buttons "Register", "I have a key".
  - Key messages: malformed "That doesn't look like a Locker Manager key. Copy the whole key from the email, starting with LM1." bad_signature "That key isn't valid. Check you copied all of it, or ask for a new one." expired "That key expired on {date}. Ask for a new one." unknown_version "That key is for a newer version of Locker Manager. Update the app, then try again."
  - Success: "Registered to {school}." About: "Registered to {school} ({id})" or "Not registered".
  - New file dialog when unregistered: shows the Welcome text above instead of the form.

- [ ] **Step 1: Write a failing unit test for the view mapping**

  Put `toRegistrationView(status: RegistrationStatus, enforced: boolean): RegistrationView` in `src/main/registration/registration.ts`. Test in `tests/unit/registration/view.test.ts`: registered maps school, id, email and source; unregistered maps nulls; `enforced` passes through.

- [ ] **Step 2: Run it and see it fail**

  Run: `npx vitest run tests/unit/registration/view.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement the mapping, the channels, the handlers, preload and the screens**

  Follow `OperatorDialog.tsx` and `Modal.tsx` for the dialog pattern; put the form in a child component inside the dialog content (CLAUDE.md gotcha about `set-state-in-effect`).

- [ ] **Step 4: Check**

  Run: `npm run check && npm run build`
  Expected: PASS. Then run `LOCKER_MANAGER_REGISTRATION=enforce npm run dev` and look at the Welcome screen, the dialog, and a fixture opened read-only. (Paste a key made with the task 7 helper.)

- [ ] **Step 5: Commit**

  ```bash
  git add src tests/unit/registration/view.test.ts
  git commit -m "feat(registration): register, enter a key, and see who the copy is registered to"
  ```

---

### Task 6: Sending a registration from the app

**Files:**
- Create: `src/main/registration/send.ts` (Electron-free; takes a `fetch` function)
- Modify: `src/main/registration/ipc.ts` (`registrationSend` handler uses `net.fetch`)
- Modify: `src/shared/registration.ts` (`REGISTRATION_URL`, `REGISTER_PAGE_URL`, form schema)
- Test: `tests/unit/registration/send.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // src/shared/registration.ts
  export const REGISTRATION_URL: string   // the `register` function's address; placeholder 'https://registration.invalid/register' until task 11
  export const REGISTER_PAGE_URL = 'https://mrdavearms.github.io/locker-manager/register/'  // confirm the Pages address from site deploy before using
  export const RegistrationFormSchema = z.object({
    name: z.string().trim().min(2).max(100),
    school: z.string().trim().min(3).max(150),
    email: z.string().trim().email().max(200),
    state: z.enum(['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA', 'Outside Australia']),
    role: z.string().trim().max(100).optional(),
    privacyAgreed: z.literal(true)
  })
  export type RegistrationForm = z.infer<typeof RegistrationFormSchema>
  export type SendResult =
    | { ok: true }
    | { ok: false; reason: 'offline' | 'blocked' | 'server' | 'too_many'; message: string; mailto: string }

  // src/main/registration/send.ts
  export async function sendRegistration(form: RegistrationForm, deps: { fetch: typeof fetch; url: string; appVersion: string; timeoutMs?: number }): Promise<SendResult>
  export function registrationMailto(form: RegistrationForm, appVersion: string): string
  ```
  The request is `POST` JSON `{ ...form, source: 'app', appVersion }`. Default timeout 15 000 ms through `AbortSignal.timeout`. Mapping: network error or timeout gives `offline`; HTTP 403 or an HTML response (a school filter page) gives `blocked`; 429 gives `too_many`; other non-2xx gives `server`. Every failure includes `mailto` (to `dave@dandsarmstrong.com`, subject "Locker Manager registration", the form fields in the body, URL-encoded).
  - The dialog shows the message plus two buttons: "Use the website form" (opens `REGISTER_PAGE_URL` with `shell.openExternal`) and "Send by email instead" (opens the `mailto`).
  - Success text: "Thanks. Dave Armstrong checks each registration by hand, usually within a day. Your key will come to {email}."

- [ ] **Step 1: Write the failing tests** with a fake `fetch`:
  - 200 JSON `{ ok: true }` gives `{ ok: true }` and the body sent includes `source: 'app'` and `appVersion`.
  - fetch rejecting with `TypeError('fetch failed')` gives `offline`.
  - fetch that never resolves, with `timeoutMs: 50`, gives `offline` within 1 second.
  - 403, and 200 with `content-type: text/html`, give `blocked`.
  - 429 gives `too_many`; 500 gives `server`.
  - `registrationMailto` contains `mailto:dave@dandsarmstrong.com?subject=Locker%20Manager%20registration` and the school name URL-encoded (test with "St Mary's & St Joseph's").
  - `RegistrationFormSchema` refuses `privacyAgreed: false` and an email without `@`.

- [ ] **Step 2: Run them and see them fail**

  Run: `npx vitest run tests/unit/registration/send.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement `send.ts` and the handler**

- [ ] **Step 4: Run them and see them pass**

  Run: `npm run check`
  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add src/main/registration src/shared/registration.ts tests/unit/registration/send.test.ts
  git commit -m "feat(registration): send a registration from the app, with website and email fallbacks"
  ```

---

### Task 7: End-to-end tests

**Files:**
- Modify: `tests/e2e/launch.ts` (options `registration?: 'enforce'`, `computerKey?: string`)
- Create: `tests/e2e/registrationKeys.ts` (run-time key pair and `makeKey(partial)`)
- Create: `tests/e2e/registration.spec.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `launchApp({ registration: 'enforce' })` sets `LOCKER_MANAGER_REGISTRATION=enforce` and `LOCKER_MANAGER_REG_TEST_PUBKEY` (base64 SPKI DER of the run-time pair). `computerKey` is written into the `preferences.json` that `launchApp` already writes. `makeKey(partial?: Partial<RegistrationDetails>): string` signs with the run-time private key, defaults as in task 1.

- [ ] **Step 1: Write the tests** (each starts with `registration: 'enforce'`):
  - `a new install can try the demo but not start a school file`: Welcome shows `register-button`; Try the demo school opens the demo with editing; New file shows the registration text.
  - `a pasted key registers the copy`: `have-key-button`, paste `makeKey()` split over lines, `key-submit`; `key-message` says "Registered to Example Secondary College"; New file now shows its form.
  - `a wrong key says why`: paste `'hello'`; message starts "That doesn't look like a Locker Manager key".
  - `an unregistered copy opens a school file read-only and leaves the lock alone`: place a fixture (`placeFixture(sharedFolder())`), open it; read-only banner says "not registered"; no `.lock` file beside it (check the lock file name in `src/main/file/lockFile.ts`).
  - `entering a key while a file is open starts editing`: continue the previous case, enter a key; the read-only banner goes; History later shows "Registration added to this file".
  - `a key in the school's file covers a new computer`: copy the file from the previous case, launch a second copy with a fresh userData and no key; it opens in edit mode; its `preferences.json` now holds `registrationKey`.
  - `an existing install with no key is look-only after updating`: an operator already set, as an updated copy would have, and no key; open a fixture; read-only banner says "not registered".
  - `Open a backup needs a key`: unregistered, press Open a backup… on the first screen; the registration text shows and no file dialog opens.
  - Re-run `tests/e2e/small-school.spec.ts` with `registration: 'enforce'` and a `computerKey` to prove the simple path still works when registered.

- [ ] **Step 2: Run them**

  Run: `npm run build && npx playwright test tests/e2e/registration.spec.ts tests/e2e/small-school.spec.ts`
  Expected: PASS. Fix the app, not the test, when a test shows a real fault.

- [ ] **Step 3: Run the whole end-to-end suite once** to prove nothing else changed (registration is off by default there).

  Run: `npm run test:e2e`
  Expected: PASS.

- [ ] **Step 4: Commit**

  ```bash
  git add tests/e2e
  git commit -m "test(registration): new installs, keys, read-only files and shared files"
  ```

---

### Task 8: The registration service

**Files:**
- Create: `registration-service/` with `package.json`, `tsconfig.json`, `firebase.json`, `.firebaserc` (project id from task 11; placeholder `locker-manager-reg`), `firestore.rules` (deny all client access: only the functions read and write), `src/index.ts` (the four HTTP functions), `src/logic.ts` (pure handlers), `src/pages.ts` (HTML for review and list pages), `src/mail.ts`, `src/keyFormat.ts` (copied, see below), `test/logic.test.ts`
- Modify: root `package.json` (script `registration:sync-key-format` copies `src/main/registration/keyFormat.ts` and the `RegistrationDetails` type into `registration-service/src/`), `eslint.config.*` and `tsconfig*.json` to ignore `registration-service/`, `electron-builder.yml` to exclude it, `.github/workflows/ci.yml` (one job: `npm ci --prefix registration-service && npm test --prefix registration-service`)
- Test: `registration-service/test/logic.test.ts`; `tests/unit/registration/serviceCopy.test.ts` (the copied file matches the app's file byte for byte)

**Interfaces:**
- `logic.ts` takes injected ports so tests need no Google services:
  ```ts
  interface Store { add(r: NewRegistration): Promise<Registration>; get(id: string): Promise<Registration | null>; update(id: string, patch: Partial<Registration>): Promise<void>; list(): Promise<Registration[]>; countRecentFrom(ip: string, sinceMs: number): Promise<number>; nextNumber(): Promise<number> }
  interface Mailer { send(to: string, subject: string, text: string): Promise<void> }
  interface Registration { id: string; number: number; name: string; school: string; email: string; state: string; role: string | null; source: 'app' | 'website'; appVersion: string | null; ip: string; createdAt: string; status: 'waiting' | 'approved' | 'rejected'; reviewToken: string; decidedAt: string | null; key: string | null }
  export async function handleRegister(body: unknown, ip: string, deps): Promise<{ status: number; json: object }>
  export async function handleReview(id: string, token: string, deps): Promise<{ status: number; html: string }>
  export async function handleDecide(id: string, token: string, decision: 'approve' | 'reject', sendRejectEmail: boolean, deps): Promise<{ status: number; html: string }>
  export async function handleList(adminToken: string, format: 'html' | 'csv', deps): Promise<{ status: number; body: string; contentType: string }>
  ```
  `deps` holds `store`, `mailer`, `privateKey: KeyObject`, `adminToken`, `daveEmail`, `baseUrl`, `now`.
  - Registration ids are `R-` plus the number padded to 5 digits (`R-00012`), from a Firestore counter document updated in a transaction.
  - `reviewToken` is 32 random bytes, base64url. `handleDecide` compares tokens with `timingSafeEqual` and refuses a registration that is no longer `waiting` (shows "Already approved on {date}").
  - Approval signs `{ v: 1, id, school, name, email, issued: today, plan: 'free', expires: null }` with `signKey` and emails it with the wording in design section 6.3.
  - The review page is a GET that changes nothing; its buttons POST to `decide` (design 6.2).
  - Validation reuses the same field rules as `RegistrationFormSchema` (task 6), copied into the service by the sync script. A filled hidden field `website` returns 200 `{ ok: true }` and stores nothing. More than 5 from one IP in an hour returns 429.
  - CORS allows only `https://mrdavearms.github.io` (confirm the real Pages origin) for `register`.
  - Secrets read at run time: `REG_SIGNING_KEY` (PKCS8 PEM), `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `REG_ADMIN_TOKEN`. Region `australia-southeast1`.

- [ ] **Step 1: Write the failing tests** in `registration-service/test/logic.test.ts` with an in-memory store and a recording mailer:
  - a good registration returns 200, stores `waiting`, sends two emails (Dave: contains name, school, email and a review link with the token; registrant: "received").
  - a bad email returns 400 and sends nothing; the honeypot returns 200 and stores nothing; the sixth from one IP in an hour returns 429.
  - review with a wrong token returns 404 and no details; with the right token it shows the details and two forms posting to `decide`.
  - approve signs a key that the app's `checkKey` accepts with the matching public key, emails it to the registrant, and stores `approved` with the key; a second approve shows "Already approved".
  - reject with `sendRejectEmail: false` sends nothing; with true sends one polite email.
  - list with the wrong admin token returns 404; CSV has a header row and one row per registration, with formula characters (`=`, `+`, `-`, `@`) at the start of a field escaped by a leading `'`.
  - `tests/unit/registration/serviceCopy.test.ts`: the service's `keyFormat.ts` equals the app's.

- [ ] **Step 2: Run them and see them fail**

  Run: `npm test --prefix registration-service`
  Expected: FAIL.

- [ ] **Step 3: Implement `logic.ts`, `pages.ts`, `mail.ts` (Nodemailer `service: 'gmail'`, as in `~/Antigravity/Hunt1000/functions/index.js`), and `index.ts` (Firebase `onRequest` wrappers with Firestore and secrets)**

- [ ] **Step 4: Run the tests and see them pass**

  Run: `npm test --prefix registration-service && npm run check`
  Expected: PASS. Also run the functions locally with the Firebase emulator (`npx firebase emulators:start --only functions,firestore` inside `registration-service/`) and post one registration with `curl` to see the emails logged by a test mailer.

- [ ] **Step 5: Commit**

  ```bash
  git add registration-service package.json eslint.config.* tsconfig*.json electron-builder.yml .github/workflows/ci.yml tests/unit/registration/serviceCopy.test.ts
  git commit -m "feat(registration): the service that receives registrations and emails keys"
  ```

---

### Task 9: Website form, Dave's key script, and the release guard

**Files:**
- Create: `site/register/index.html` (same look as `site/index.html`; the form from task 6 with the privacy note and hidden `website` field; posts to `REGISTRATION_URL` with `fetch`; shows the success text or the email fallback)
- Modify: `site/index.html` and `site/download/index.html` (a "Register your school" link and the line "Free for schools. Registration required." near the download button)
- Create: `scripts/registration-make-key.mjs` and root `package.json` script `registration:make-key`
- Modify: `src/main/selfTest.ts` (new check `registration key`)

**Interfaces:**
- `npm run registration:make-key -- --school "..." --name "..." --email "..." [--expires YYYY-MM-DD]` reads `REG_SIGNING_KEY` with `gcloud secrets versions access latest --secret=REG_SIGNING_KEY --project=<task 11 id> --account=dave@dandsarmstrong.com`, signs with `signKey` (import through `tsx` or a small compiled copy; reuse, do not rewrite), prints the key, and adds a registration document marked `approved`, `source: 'manual'`, using Firebase Admin with Dave's Application Default Credentials. Never writes the private key to disk.
- Self-test check `registration key`: in an installed copy, fails when `PRODUCTION_PUBLIC_KEY` is null or does not parse as an Ed25519 public key. This stops a release that would lock every school out because it cannot check any key. Not installed: passes.
- Privacy note on both forms (exact words): "We collect your name, school, email and role to send your registration key and to contact your school about Locker Manager. It is stored on Google Cloud in Sydney, seen only by Dave Armstrong, and never shared. Email dave@dandsarmstrong.com to have it removed."

- [ ] **Step 1: Write the failing test**: `tests/unit/selfTestRegistration.test.ts` for an exported `checkProductionKey(key: string | null): void` that throws for null, for `'abc'`, and for an RSA public key, and passes for a run-time Ed25519 public key.
- [ ] **Step 2: Run it and see it fail**: `npx vitest run tests/unit/selfTestRegistration.test.ts`, expected FAIL.
- [ ] **Step 3: Implement** `checkProductionKey`, wire it into `runSelfTest`, build the site page and the script.
- [ ] **Step 4: Check**: `npm run check` passes. Open `site/register/index.html` in the browser pane at phone width (375 px) and desktop width; the form fits with no sideways scroll. Do not publish: the Pages workflow publishes on push to `main` when `site/` changes, so commit the site page only after task 11 sets the real URL, or keep it out of `site/index.html` links until then.
- [ ] **Step 5: Commit** (script and self-test now; site files with task 11)

  ```bash
  git add scripts/registration-make-key.mjs package.json src/main/selfTest.ts tests/unit/selfTestRegistration.test.ts
  git commit -m "feat(registration): a release cannot ship without the key checker, and Dave can make a key by hand"
  ```

---

### Task 10: Words for staff, IT and the record

**Files:**
- Modify: `docs/user-guide.md` (new section "Registering Locker Manager": why, how, what works before a key arrives (no grace period: existing schools are look-only after updating until they enter a key), the key covering the whole school, what is sent and what is not)
- Modify: `src/shared/guideLinks.ts` (Welcome and the registration dialog open that section; the existing unit test checks the slug)
- Modify: `docs/it-guide.md` (the `registration.key` file and its paths on Windows and Mac; why it is not in `managed.json`; firewall row for the service host, needed only for in-app registration; privacy paragraph; "the app never sends anything to check a key")
- Modify: `README.md` (status line "Free for schools. Registration required from 0.13.0"; privacy section sentence)
- Modify: `SPEC.md` (a note under 1.2, dated, pointing to the design; original wording kept)
- Modify: `CLAUDE.md` (decision 30, short, in the style of the others; "Where things live" gains `src/main/registration/` and `registration-service/`)
- Create: `docs/release-highlights/v0.13.0.md` (staff-facing: what registration is, the date, how to register, that it is free)

- [ ] **Step 1**: Write the pages above. Use Plain English. The release highlights must tell existing schools to register before updating, because after updating they are look-only until a key arrives.
- [ ] **Step 2**: `npm run check` passes (the guide link test included).
- [ ] **Step 3: Commit**

  ```bash
  git add docs README.md SPEC.md CLAUDE.md src/shared/guideLinks.ts
  git commit -m "docs(registration): explain registration to staff, IT and future work"
  ```

---

### Task 11: Set up and deploy the service (Dave's go-ahead needed at each starred step)

Every command here runs as `dave@dandsarmstrong.com`. Stop and ask Dave before each step marked ★.

- [ ] **Step 1 ★: Create the Firebase project** `locker-manager-reg` (or the id Dave prefers) under `dave@dandsarmstrong.com`, Firestore in `australia-southeast1`, Blaze plan (Dave turns on billing himself in the console), and a budget alert at A$5 a month. Add the project to the GCP Projects table in `~/.claude/CLAUDE.md` with Dave's agreement.
- [ ] **Step 2 ★: Make the signing key pair on Dave's Mac, in the scratchpad, never in the repo**

  ```bash
  openssl genpkey -algorithm ed25519 -out "$TMPDIR/reg-signing.pem"
  openssl pkey -in "$TMPDIR/reg-signing.pem" -pubout -outform DER | base64
  ```
  Put the private key into Secret Manager as `REG_SIGNING_KEY`, then delete the file. Put the base64 public key into `PRODUCTION_PUBLIC_KEY` in `src/main/registration/registration.ts`. Also keep a copy of the private key where Dave keeps other recovery secrets (losing it means every future key needs a new app release). Ask Dave where.
- [ ] **Step 3 ★: Email secrets**: `GMAIL_USER` = `dave@dandsarmstrong.com` and `GMAIL_APP_PASSWORD` (Dave creates the app password himself; never type it for him). `REG_ADMIN_TOKEN`: 32 random bytes, base64url, made with `openssl rand -base64 32 | tr '+/' '-_' | tr -d '='`.
- [ ] **Step 4 ★: Deploy** with `npx firebase deploy --only functions,firestore:rules --project <id>` from `registration-service/`. Put the real `register` URL into `REGISTRATION_URL`, `site/register/index.html` and the IT guide firewall row.
- [ ] **Step 5 ★: Live test with Dave**: Dave registers his own school from `npm run dev` with `LOCKER_MANAGER_REGISTRATION=enforce` (the dev copy accepts the production key too), approves it from his email, pastes the key, and sees "Registered to ...". Then from the website form. Then the list page and CSV.
- [ ] **Step 6: Commit**

  ```bash
  git add src/main/registration/registration.ts src/shared/registration.ts site docs/it-guide.md registration-service/.firebaserc
  git commit -m "feat(registration): connect the app and website to the live registration service"
  ```
  Pushing this publishes the website form (Pages workflow). That push is ★ too.

---

### Task 12: Final check before release

- [ ] **Step 1**: `npm run check && npm run build && npm run test:e2e` all pass.
- [ ] **Step 2**: `npm run dist:dir`, then run the packaged app with `--self-test`; expect "self-test passed" in the log. Then open the packaged app by hand: Welcome shows registration; the demo opens; pasting Dave's real key registers it.
- [ ] **Step 3**: Request a fresh code review of the whole change (superpowers:requesting-code-review), telling the reviewer to look hardest at the session gate (task 4) and the service's token handling (task 8).
- [ ] **Step 4**: Update `README.md` and `site/index.html` wording for 0.13.0 (CLAUDE.md rule), commit.

### Task 13: Release 0.13.0 (only when Dave says so)

- [ ] **Step 1 ★**: Run `scripts/release.sh` for 0.13.0 as usual (it runs the Mac two-update proof first). Do not pipe it through `tail`.
- [ ] **Step 2**: Confirm the update proof passes on Windows and Mac, and that a copy of 0.12.1 updates to 0.13.0 and opens the school file read-only with the "not registered" message.
- [ ] **Step 3**: Tell Dave the release is out, with the release page link, and remind him that registrations will start arriving at the address he chose.
