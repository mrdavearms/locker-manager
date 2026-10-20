# Documentation and licences audit

_9 October 2026. Locker Manager 0.10.0, branch main at ae0f6f8. Report only: no docs,
source or config were changed._


## Status, 18 October 2026

Items 1 to 7 and nearly all of A.1 and A.2 were fixed before this date (third-party notices,
practice copies without codes on other computers, README privacy section, site, guide
labels). Fixed on 18 October: the IT guide's practice-copy, backup-rules and "from M4"
wording, version line, per-user automatic installs, the unsigned-Windows note; signing.md job
names; the release checklist's highlights and "from M5" lines; CLAUDE.md's update-proof job
and landing page notes; letters without codes printing read-only; the PIN wait and IT-required
PIN in the user guide. Spell check is now off in the window (B.9), so Windows never fetches
dictionaries.

Also fixed on 18 October: the user guide now covers removing a locker, the student's
accessible tick box, when Quick start shows, Letters paper and colour, History search, the
allocation advice and **Back to the draft as made**, the Help menu's download page, installing
updates by hand, and IT's default file and hidden demo. The eight guide sections have "Show
me" links, and the Year levels tab has its own screen id, so the Guide opens there.

Still open: deleting a student who has left (B.3, Dave's decision).

## Summary, most important first (for promoting to other schools)

1. **No third-party notices ship with the app** (C). React, Radix, Lucide icons,
   class-variance-authority and three window fonts are bundled with their licence text
   stripped; the Mac app has no Electron or Chromium licence file; the About box and README
   mention none of this. All licences allow redistribution with an MIT app; the gap is
   attribution, and it is easy to fix with a generated notices file and an About button.
2. **A read-only computer can see codes without the school's file recording it** (A.2,
   B.12). "Practise on a copy" shows for read-only users, the real file records the copy
   only in edit mode (`src/main/fileService.ts:265-268`), and the copy holds every code.
   Without a PIN this breaks the README, IT guide and decision 22 promise. Code fix needed,
   not only docs.
3. **README privacy section is incomplete** (B). It leaves out notes, key charges, letter
   language, print and reveal records, the append-only history, the practice copy and
   per-computer backups, logs and preferences paths, that uninstall leaves data behind,
   that saved letters and exports hold plain codes, and the key-in-the-same-file limit of
   the encryption. **There is no way to delete a student** and the history cannot be
   deleted; a privacy officer will ask. Replacement text is drafted in B.
4. **IT guide names the wrong download host** (A.2): GitHub now redirects to
   `release-assets.githubusercontent.com`, not `objects.githubusercontent.com`. A firewall
   built from the guide blocks updates.
5. **README overclaims**: "Every feature in the specification is built" is false
   (passphrase, crash reports, in-app release notes, i18next). 1.0 conditions are
   understated.
6. **Simple-schools and Fix-before-1.0 work is missing from README and site**; the user
   guide covers it well. Site says codes "never repeat" (true only for 3 years, and can be
   turned off) and shows no pre-release status.
7. **User guide has a handful of wrong labels**: "Print" menu item is "Labels"; "Print this
   list" opens Reports; "four lists" on import is three; named backups can be removed over
   the size cap; Move or swap starts with finding the student. Guide link slugs all match
   (test passes).
8. IT guide header still says version 0.1.0 and "managed settings arrive with M8"; backup
   rules are described as fixed but are a setting; signing doc job names are slightly off;
   Windows About always says "Unsigned".

## A. Documentation accuracy

Checked by reading each document and the code. Line numbers are the document's.

### A.1 docs/user-guide.md

Correct and checked: 10-minute PIN unlock, 60 s heartbeat and 10 min stale lock, 50 undo
steps, 8-second message strip with Undo, 2-second save, backup defaults (7 days, 92 days,
500 MB), update checks (30 s, then 4 hours), quick start, "We don't use this" and "Use it
after all", Add a student, Year levels tab, Move or swap, Tick all, "Mark N as reset",
Print labels and Print letters after allocating, "Give out lockers now", letters progress
bar and Cancel, the tour, Help menu, Practise on a copy, reports and settings file.

**Wrong**

| Line | Guide says | Code does | Evidence |
|---|---|---|---|
| 483 | "Click **Print** in the left-hand menu" | The menu item is **Labels** | `src/renderer/src/components/NavRail.tsx:21` |
| 185-186 | Named backups "are always kept" | Over the size cap, oldest unnamed go first, then oldest named; only the newest is never deleted | `src/main/file/backups.ts:80-81, 134-143` |
| 183 | "Every backup is kept for 7 days" | Over the cap, saves 1 hour to 7 days old are thinned to one per 10 minutes | `backups.ts:117-131` |
| 308-313 | Compare and import: "four lists", button "Import" | Three lists (New, Changed, Possible leavers) plus a line "N students unchanged"; button "Import N changes" | `src/renderer/src/import/ImportWizard.tsx:569, 599, 627, 855` |
| 370 | "Leave **Issue a code to each locker now** ticked" | Only shown when a drafted locker takes a code (small schools never see it) | `src/renderer/src/lockers/AllocateScreen.tsx:446-452, 567-579` |
| 444 | Move or swap: choose Move or Swap | Home first asks "Who is moving or swapping?" and you find the student | `HomeScreen.tsx:221`, `LockerActions.tsx:311-319` |
| 466 | "**Print this list** to take a paper copy" | Opens Reports with "Locks to reset" selected | `App.tsx:141-142` |
| 700 | Problems: "click the button beside each one" | "Locks waiting for a reset" has no button; "letters not yet printed" appears only after a first print | `src/main/repos/problems.ts:95-101, 119-121` |
| 61 | "a blue bar appears" (Mac update) | Pale teal info bar | `UpdateBanner.tsx:25, 47-50` |
| 131 | Unsaved work "is kept as a backup" | Screen says it "stays on their computer as a backup"; guide does not say where | `ReadOnlyBanner.tsx:65-67` |
| 40 | Installs for your user only | Installer offers "Only for me" or "Anyone"; per-user is the default (`oneClick: false`, `perMachine: false`). Confirm on Windows | `electron-builder.yml:69-74` |

**Imprecise or outdated**

- 71: About is at the top right of every screen, and in the Help menu (Mac app menu too).
- 346-347: Find is hidden in narrow windows (Ctrl+K still works). Locker, serial and key
  numbers must be typed in full; only names and IDs match part of the text
  (`src/main/repos/history.ts:79-80, 113`).
- 279-281: Usual lock needs **Save usual lock**; the bank button reads "Apply to N lockers"
  (`LocksForm.tsx:143, 195`).
- 421: the choice is "Move to N" or **Not now** (`StudentsScreen.tsx:249, 267`).
- 670: button reads "Archive 2026 and start 2027" (`RolloverScreen.tsx:264`).
- 122-124: letters without codes can be printed on a read-only computer; only letters with
  codes need edit mode (`documentService.ts:85-89, 131-132`).
- 746-748: the settings file also carries import options and saved column matches
  (`settingsFile.ts:16-23`).
- 474: setting or changing the PIN empties the undo list; undo also has a 200 MB cap
  (`session.ts:121, 432`).

**Not mentioned**

- "Restart and update" waits while a save, print or import runs, and saves and closes the
  file first (`policy.ts:62-67`, `updater.ts:172-180`).
- On Windows, "No, tell me and I will download it" gives the same download bar as a Mac.
- Five wrong PINs means a 30-second wait; IT can require a PIN, which then cannot be
  removed (`privacy.ts:97-101, 124-125`).
- Ctrl+Y redoes. Remove a locker (Lockers panel **Remove…**, only when empty).
- How to mark a student as needing an accessible locker (tick box in the student panel).
- Quick start appears only while the file has no areas, 1 to 2000 lockers.
- The practice copy is recorded in the real file, lives on this computer, and holds codes.
- Letters: Paper (A4 or US Letter) and Colour settings. History search box.
- IT can hide the demo school and point the Welcome screen at a default file.
- Allocation: students who did not fit are listed with advice; **Back to the draft as
  made** button. Help menu **Open the download page**.

**Guide links**: `src/shared/guideLinks.ts` slugs all match headings
(`tests/unit/markdown.test.ts`, 4 tests pass). Sections with no "Show me" button: add a
student by hand, change year level or group, new student, student has left, move or swap,
practise on a copy, message strip and Undo, share your set-up. The Year levels settings
tab has no `FOR_SCREEN` entry, so the Guide opens at "Find a setting".

### A.2 README.md, IT guide, signing, release checklist, site

**README.md**

- 9: "Every feature in the specification is built." Not built: passphrase for codes
  (SPEC 8.6, deliberately deferred, decision 16), opt-in crash reports (SPEC 11), release
  notes shown in the app (SPEC 9.3: `updater.ts:105-110` sends them, no screen shows them),
  i18next. The beta channel is built ("Test versions too").
- 9-10: 1.0 waits for more than label printing: letters on paper, a Windows install,
  signing, and the eight hand checks in `docs/release-checklist.md:76-94`.
- 17-18: on a Mac the app does not open the download page itself; it shows a bar with an
  "Open the download page" button (`UpdateBanner.tsx:53-61`).
- 27-28: "never repeating a locker's old code" is the default rule for the last 3 years
  and can be turned off (`src/shared/codes.ts:41-42`).
- 28-29, 52-53: "every code shown, printed or exported is recorded" is broken by the
  practice copy on a read-only computer. `HomeScreen.tsx:232-249` shows the button to all;
  `fileService.ts:265-268` records the copy only when `st.mode === 'edit'`; the copy has
  the code key and opens for editing. Without a PIN, codes can be shown with no record in
  the school's file. Also contradicts decision 22 and `it-guide.md:150-152`.
- 43-45: "a second copy of the backups on each computer that opens it": only computers
  that save (edit) write one, and they hold codes.
- Missing: small-school path (quick start, "We don't use this"); Fix-before-1.0 features
  (message strip with Undo, adding students by hand, year level and group changes, Move or
  swap, out-of-service offer to move, reset tick boxes, print buttons after allocating,
  "Give out lockers now", letters progress and Cancel); demo school, practice copy, PIN,
  tour, QR label links, per-change conflict merge, per-line allocation order.
- Licence line names only Arimo (see C).

**docs/it-guide.md**

- 58: download host is now `release-assets.githubusercontent.com` (checked with curl:
  `github.com/.../releases/download/v0.10.0/latest.yml` redirects there). It also serves
  `latest.yml` and `latest-mac.yml`. Firewall table is wrong.
- 57: path list omits `/releases/latest`, used by electron-updater for stable-only installs
  (same host).
- 48-49: "From 1.0.0 the app takes only stable releases" is untrue if a user picks "Test
  versions too" (`updater.ts:36`) unless IT locks `updateChannel`.
- 150-152: codes "only by the person editing": broken by the practice copy (above).
- 176-177: only `autoUpdate` and `updateChannel` show "Set by your IT team";
  `requirePinForCodes` shows "Required by your IT team"; `defaultDataFile` and
  `demoEnabled` show no marker.
- 193: button is "Open it", not "Open".
- 3: header says version 0.1.0 and "Managed settings arrive with milestone M8". Stale.
- 122: "(from M4 onwards)" means nothing to IT now.
- 119-122: backup rules are a school setting (Settings, Storage; 1-90 days, 7-730 days,
  50-5000 MB, `src/shared/storage.ts:6-16`), not fixed. Burst thinning not mentioned.
- 122-124: warns only about the shared backups; per-computer backups and the Practice
  folder hold codes too.
- Missing: `.lockers` file association and `lockermanager://` protocol registered by the
  installer; users can turn off automatic install; `preferences.json` holds more than name
  and recent files (appearance, updates, ignored copies, start counts, tour, checklist).
- Correct: install paths, `/S /allusers`, update timings, unsigned Mac behaviour, quiet
  failures, managed.json paths and five keys, PIN (scrypt, 5 tries, 10 min), hide 10 s to
  2 min default 30 s, lock timings, journal mode, SHA-256, temp tidy, recovery, log size,
  external links, single instance, 3 MB pictures.

**docs/signing.md**

- 99, 174: job names are "Build macOS (universal)" and "Build Windows (x64 + arm64)".
- 108: About shows "Signed: Yes" only on a Mac; signing is detected only on macOS
  (`index.ts:76-79`), so a signed Windows build will still say "No (unsigned build)".
  Code gap.
- Secret names match `release.yml`; no secrets are set yet, as the doc says.

**docs/release-checklist.md**

- 9-11: `scripts/release.sh` stages only package.json and package-lock.json, and always
  pushes to main. A highlights file must be committed first; neither point is stated.
- 59-60: "From M5 onwards" is stale wording.

**site/index.html**

- 328: codes "never repeat" (see above). 344: letters show "each student's locker and
  code"; locks with no code show none.
- No pre-release or 0.x notice; nothing on small schools, adding students by hand, the
  optional PIN, or manual Mac updates.

**Outside the five documents**: CLAUDE.md says the landing page is not published (it is
live through `pages.yml`) and that the update proof is job `prove-update` in release.yml
(it is `.github/workflows/update-proof.yml`, job `prove`).

## B. Privacy statement

SPEC.md section 11 asks for the README to say plainly what data is stored and where. The
README has a short "Your data (for privacy assessments)" section (README.md lines 45 to 60).
The IT guide (docs/it-guide.md lines 70 to 257) has most of the detail. Neither is complete
enough for a school to fill in a privacy impact assessment without reading the code.

### What the README gets right

- One `.lockers` file in a folder the school chooses, with backups beside it.
- Codes are encrypted and hidden, and every code shown, printed or exported is recorded.
- No server, and the app only contacts GitHub for updates.
- It names the Victorian Department's privacy requirements.

### What is wrong or missing (checked against the code)

1. **Fields held are incomplete.** The schema (`src/main/db/migrations/001_initial.sql`,
   `002_import.sql`, `003_letters.sql`) also holds: names exactly as imported as well as
   corrected names (`first_name_raw`, `last_name_raw`, `preferred_name_raw`); first-seen,
   last-seen, left date and "not in import since" dates; name-check flags; the letter
   language per student (`student.custom.language`, set in `src/main/repos/letters.ts:165`);
   key register events with dates, notes and **charges in cents** (`key_event.amount_cents`,
   shown in `src/renderer/src/lockers/KeyPanel.tsx`); free-text notes on assignments and
   locks; the names of imported files (`import_batch.files`); a record of every print run,
   with who, which computer and which students (`print_job`); a record of every code shown
   (`code_reveal_log`: who, computer, student, locker, where shown); and pictures and the
   school logo the school adds.
2. **The history holds copies of old values and cannot be deleted.** `audit_log` stores
   before and after values (so old names and details stay in the file), and triggers in
   001_initial.sql refuse any update or delete. Schools need to know this for retention.
3. **No way to delete a student.** A leaver is marked inactive (`active = 0`, `left_at`)
   in `src/main/repos/students.ts:248`, `assignments.ts:130` and `rollover.ts:273`. Nothing
   removes a student row, and nothing ages out the history. The README should say so, and
   say what a school can do (start a new file and keep the old one under its records
   policy, or delete the whole file and backups). This is likely the first question a
   privacy officer asks. Consider a "remove students who left before <date>" feature
   before 1.0, or at least state the limit plainly.
4. **Copies on each computer are under-described.** The README says "a second copy of the
   backups on each computer that opens it". The code writes local backups only when that
   computer saves (edit mode) (`src/main/file/session.ts:566-588`), to
   `<userData>/backups/<file id>/`, with the same retention rules as the shared folder.
   The README does not mention the **practice copy** (`<userData>/Practice/`,
   `src/main/fileService.ts:259-283`), which is a full copy with every code and stays until
   the next practice session. Neither is removed when the app is uninstalled
   (`electron-builder.yml`: `deleteAppDataOnUninstall: false`). A laptop that leaves the
   school carries student data and codes.
5. **Per-computer settings and logs are not in the README.** `preferences.json` holds the
   operator's name, recent file paths and school names (`src/main/prefs/preferences.ts`).
   Logs are at `%AppData%\Locker Manager\logs\main.log` (Windows) and
   `~/Library/Logs/Locker Manager/main.log` (Mac, the folder exists on this Mac), rotated at
   2 MB (`src/main/index.ts:28-31`). The IT guide has these; the README does not point to
   them.
6. **The lock file names people.** `<name>.lockers.lock` beside the data file holds the
   editor's name and computer name (`src/main/file/lockFile.ts`). Staff names and computer
   names are also in every history line.
7. **Files the school saves.** Labels, letters, reports and exports are saved where the
   operator chooses (default the Documents folder, `src/main/renderService.ts:42`). Letters,
   some reports and the whole-file export can carry codes in plain text (CSV or XLSX marked
   CONFIDENTIAL, `src/main/reports/export.ts:40`; `src/main/portable/workbook.ts`). Once
   saved, these are outside the app's control. The README does not say this.
8. **Encryption limits are only in the IT guide.** The README says codes are "encrypted"
   but not that the key sits in the same file, so anyone with the file and some skill can
   read the codes (`src/main/codes/cipher.ts`, meta `code_key_v1`). The PIN only gates the
   app's screens; it does not encrypt anything (`src/main/privacy.ts`). The README should
   say both.
9. **Network traffic is not described exactly.** Checked in code: no `fetch`, no
   crash reporter, no analytics anywhere in `src/`. The only traffic is electron-updater
   reading the GitHub releases feed and `latest.yml` / `latest-mac.yml` and downloading
   installers from GitHub's download server, which is now
   `release-assets.githubusercontent.com` (`src/main/update/updater.ts`,
   `electron-builder.yml` publish block; the IT guide still says
   `objects.githubusercontent.com`, see A.2). Each request carries the computer's IP address
   and a standard user-agent, as any web request does; no school data, file names or user
   names. The staged-rollout identifier electron-updater uses is a random number kept on
   the computer, not sent. Links open only GitHub pages in the browser
   (`src/main/window.ts:71-74`). **To check:** Electron's built-in spell checker is on by
   default (no `spellcheck: false` in `src/main/window.ts:58-65`); on Windows, Chromium may
   download dictionary files from a Google server. Confirm on a Windows PC by watching
   traffic, then either turn spell check off or list it.
10. **Crash reports.** SPEC.md 11 mentions optional, opt-in crash reports. None exist in
    the code. The README should say "no telemetry and no crash reports" outright.
11. **Logs "never names or codes".** True for the code read: log lines carry counts,
    states and error messages (`grep log\.` in `src/main`). Two lines can carry a file path
    or school name: `open refused` logs the first 60 characters of the refusal message
    (`src/main/fileService.ts:122`), and the updater logs URLs. Worth saying "file names
    may appear".

12. **The reveal record has a gap.** "Practise on a copy" works on a read-only computer, and
    the school's file records the copy only in edit mode (`src/main/fileService.ts:265-268`).
    The copy holds every code. Without a PIN, a read-only user can see codes with no record
    in the school's file. Fix in code (refuse practice on a read-only computer, or record it
    some other way) before the README promise is true.

### Drafted replacement for the README section

> ## Your data (for privacy assessments)
>
> Locker Manager has no server and no accounts. Everything it stores is in files your
> school controls. In Victoria, the Department's privacy and records requirements for
> schools apply to these files.
>
> **The data file** (`<name>.lockers`, in the folder your school chooses, such as a shared
> drive or OneDrive) holds:
>
> - Students: student ID, first name, surname and preferred name (as imported and as
>   corrected), year level, group, and house, gender and email only if your import has
>   those columns. A tick for "needs an accessible locker" (no medical details). The
>   language for their letter, if you set one. Dates first and last seen in an import, and
>   the date they left.
> - Lockers, locks, lock serial numbers, key numbers, and key records (issued, returned,
>   lost, charges and notes).
> - Lock codes and spare codes, encrypted (see below).
> - The school's name, logo, colours, settings and letter pictures.
> - History: every change, with the staff member's name, computer name and time, and the
>   values before and after. The history cannot be edited or deleted.
> - A record of every code shown, printed or exported, and every print run (who, which
>   computer, which students).
>
> **Beside the data file**:
>
> - `Locker Manager backups/<name>/`: earlier versions of the file. All from the last 7
>   days, one a day for 3 months, then one a week, up to 500 MB. Backups hold everything
>   the data file holds, including codes.
> - `<name>.lockers.lock`, while someone is editing: their name and computer name.
>
> **On each computer** (Windows `%AppData%\Locker Manager\`, Mac
> `~/Library/Application Support/Locker Manager/`):
>
> - `backups\`: a second set of backups, made by each computer that has edited the file.
> - `Practice\`: a full copy of the file (with codes) if someone used Practice. It is
>   replaced the next time practice starts.
> - `Demo\`: the demo school (made-up students only).
> - `preferences.json`: the person's name, recently opened files and display choices.
> - Logs (Windows `%AppData%\Locker Manager\logs\`, Mac `~/Library/Logs/Locker Manager/`):
>   actions and errors. No student names or codes. File names may appear.
>
> Uninstalling the app does not remove these folders. Delete them by hand when a computer
> leaves the school.
>
> **Files you save**: labels, letters, reports and exports go where you choose. Letters,
> some reports and exports with the "include codes" box ticked contain codes in plain
> text and are marked CONFIDENTIAL. Store and delete them like any confidential paper.
>
> **Lock codes**: hidden on screen until asked for, and hidden again after 30 seconds.
> Codes are encrypted in the file with AES-256-GCM, but the key is kept in the same file.
> This stops someone casually reading codes in a database tool; it does not stop a skilled
> person who has the file. Protect the file by limiting who can open the folder. An
> optional PIN stops staff seeing, printing or exporting codes in the app without it; the
> PIN is stored only as a scrambled (salted scrypt) value.
>
> **What leaves the computer**: no student data, ever. There is no telemetry, no
> analytics and no crash reporting. The only network traffic is the update check: the app
> asks GitHub (github.com and release-assets.githubusercontent.com) whether a newer version exists
> and downloads it. Like any web request, this shows GitHub the computer's IP address. It
> sends nothing about the school, its staff or its students.
>
> **Removing data**: the app does not delete students. A student who leaves is marked as
> left and kept, with their history, so the record stays complete. To remove students'
> data, follow your records policy: for example, keep the old file and its backups for
> the required time, then delete the data file, the `Locker Manager backups` folder, and
> the app folder on each computer that used it.

(If you add a "remove old students" feature, change the last paragraph.)

## C. Licences

### How the app is packaged

- `electron-builder.yml` packs `out/**` and `package.json` into `app.asar`, and
  electron-builder adds every production dependency (the `dependencies` block of
  `package.json` and everything they pull in) as `node_modules` inside the archive.
  `electron.vite.config.ts` leaves main-process dependencies external, which
  `out/main/index.cjs` confirms: it loads electron-log, electron-updater, exceljs, fontkit,
  papaparse, pdf-lib, qrcode, semver, sql.js, xlsx and zod at run time.
- The renderer (the window) is fully bundled by Vite into `out/renderer/assets/`. Packages
  it bundles are **devDependencies**, so their own folders and LICENSE files do not ship;
  only their code does.
- `extraResources` copies `resources/fonts` (four Arimo files plus `OFL-Arimo.txt`).
- No `asarUnpack`, no `license` file for the installer, no NSIS licence page, no
  third-party notices file anywhere in the repository, the installer or the app. The About
  box (`src/renderer/src/components/AboutDialog.tsx`) shows version, "MIT", platform,
  signed status and Electron version, and a link to the source; it does not mention
  third-party software. The README mentions only Arimo.
- Note: `release/mac-arm64/` holds a stale 0.0.1 build from 6 Oct 2026. It shows that on a
  Mac the `.app` carries no Electron `LICENSE` or Chromium `LICENSES.chromium.html` file.
  On Windows, electron-builder normally places `LICENSE.electron.txt` and
  `LICENSES.chromium.html` in the install folder; confirm with `npm run dist:dir` on
  Windows.

### Main-process dependencies that ship (148 packages, from `license-checker --production`)

| Licence | Count | MIT-compatible | Notes |
|---|---|---|---|
| MIT | 109 | Yes | Keep copyright and permission notice. |
| ISC | 22 | Yes | Same as MIT. |
| Apache-2.0 | 4 | Yes | xlsx (SheetJS), crc-32 (SheetJS), readdir-glob, @swc/helpers. Must give a copy of the licence; must pass on any NOTICE file (none of the four has one). |
| BSD-3-Clause | 2 | Yes | ieee754, duplexer2. Keep notice. |
| 0BSD | 2 | Yes | tslib 1 and 2. No obligation. |
| Python-2.0 | 1 | Yes | argparse (via js-yaml, via electron-updater). Permissive; keep notice. |
| Unlicense | 1 | Yes | big-integer. Public domain. |
| MIT AND Zlib | 1 | Yes | pako 1.0.11 (via jszip). Keep notices. |
| MIT OR GPL-3.0-or-later | 1 | Yes, under MIT | jszip (via exceljs). Choose MIT; say so in the notices. |
| BlueOak-1.0.0 | 1 | Yes | sax (via electron-updater). Permissive. |
| MIT* (from README) | 2 | Yes | chainsaw, traverse (via exceljs > unzipper > binary). |
| No licence stated | 1 | Unclear | buffers 0.1.1 (substack, via exceljs > unzipper > binary). No licence field, file or statement. Tiny practical risk; note it. |
| "UNLICENSED" | 1 | n/a | locker-manager itself: a tool artefact of `"private": true`. LICENSE is MIT. |

Top-level runtime dependencies: electron-log (MIT), electron-updater (MIT), exceljs (MIT),
fontkit (MIT), papaparse (MIT), pdf-lib (MIT, includes pako), qrcode (MIT; pulls in yargs
and others for its command line, which ship but are unused), semver (ISC), sql.js (MIT;
SQLite inside is public domain), zod (MIT), xlsx 0.20.3 (Apache-2.0).

**SheetJS (xlsx)** comes from `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` at
install time, pinned with an integrity hash in `package-lock.json:9949-9953`. It is not
loaded from the internet at run time. Apache-2.0: redistribution is allowed; the licence
text must go with it (it does, inside `app.asar` at `node_modules/xlsx/LICENSE`, but no
person can see it there). No NOTICE file exists in the package.

**No GPL, LGPL or AGPL code is linked** in the production tree, apart from jszip's dual
licence (MIT chosen). **Electron** itself is MIT, and Chromium inside it includes
LGPL-licensed FFmpeg as a separate library plus many BSD and other notices. Electron
meets those terms through `LICENSES.chromium.html`; the Mac build does not ship that file.

### Bundled into the renderer (code ships, licence files do not)

| Package | Licence | Obligation met? |
|---|---|---|
| react, react-dom, scheduler | MIT | No: Vite strips the licence headers (`grep @license out/renderer/assets/*.js` finds none). |
| @radix-ui/react-dialog and 15 @radix-ui helpers | MIT | No |
| react-remove-scroll, react-remove-scroll-bar, react-style-singleton, use-callback-ref, use-sidecar, aria-hidden, get-nonce, detect-node-es | MIT | No |
| lucide-react (icons) | ISC, plus MIT for icons derived from Feather (Cole Bemis) | No: both notices are required "in all copies". |
| class-variance-authority | Apache-2.0 | No: a copy of the licence is required. |
| clsx, tailwind-merge | MIT | No |
| tailwindcss (generated CSS) | MIT | Yes: the CSS keeps `/*! tailwindcss v4.3.3 | MIT License */`. |
| zod (also in main) | MIT | Yes, through node_modules in the archive. |
| tslib | 0BSD | Nothing needed. |

### Fonts

| Font | Where | Licence | Obligation met? |
|---|---|---|---|
| Arimo (4 files) | `resources/fonts/`, labels and letters | SIL OFL 1.1 | Yes: `OFL-Arimo.txt` ships beside it. |
| Atkinson Hyperlegible Next | renderer bundle (window text) | SIL OFL 1.1 | Partly: copyright and a licence web address are inside the font files, the licence text is not shipped. |
| Bricolage Grotesque | renderer bundle | SIL OFL 1.1 | Partly, as above. |
| Big Shoulders Stencil | renderer bundle | SIL OFL 1.1 | Partly, as above. |

The OFL allows the licence to travel in metadata, but the safe reading is to ship the
licence text. All four fonts may be redistributed with an MIT app; the OFL only stops the
fonts being sold on their own.

### Icons and pictures

- App icon `resources/build/icon.svg` and `icon.png`: drawn for this project (hand-written
  SVG, first commit 630f2fc). No third-party licence.
- In-app mark `src/renderer/src/components/LockerMark.tsx`: project's own.
- Letter pictures: the app ships none (migration 003 comment); schools add their own.
- Screen icons: Lucide (above).

### What to do

1. Add a `THIRD-PARTY-NOTICES.txt` generated at build time (for example
   `license-checker --production --plainVertical` for main-process packages, plus a
   Vite plugin such as `rollup-plugin-license` for the renderer bundle, plus the three UI
   font licences and the Electron and Chromium licence files). Ship it with
   `extraResources` so it lands beside the app on both platforms.
2. Add a "Third-party software" button to the About box that opens it, and one line in
   the README Licence section.
3. Correct the README Licence line: it names only Arimo; the window also uses Atkinson
   Hyperlegible Next, Bricolage Grotesque and Big Shoulders Stencil, all OFL.
4. Note the jszip MIT choice and the buffers package in the notices.
