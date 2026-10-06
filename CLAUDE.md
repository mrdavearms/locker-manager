# CLAUDE.md: Locker Manager

Working notes for Claude Code. Keep this short and current. Read SPEC.md before any
non-trivial change; it is the full product and technical specification, and section 15
("Lessons from the real WHS deployment") is a list of hard requirements, not background.

_Last updated: 7 October 2026 (v0.9.0 released; 1.0 waits for Dave's hand checks)._

## What this is

Locker Manager is a free, open-source desktop app (Windows and macOS) that schools use to
manage student lockers, lock codes, locker labels and welcome letters. One data file per
school in a shared folder, no server, no accounts, no internet except for updates.

- Owner: Dave Armstrong (dave@dandsarmstrong.com), Principal, Wangaratta High School.
- Repository: https://github.com/mrdavearms/locker-manager (public, MIT).
- App name: Locker Manager. Product name and app ID live in `electron-builder.yml`,
  `package.json` and `src/shared/brand.ts` once M0 lands.
- Australian English everywhere: UI, docs, comments, commit messages.

## Commands

| Task | Command |
|---|---|
| Install | `npm ci` |
| Run the app in development | `npm run dev` |
| Lint and format check | `npm run lint` and `npm run format:check` |
| Type-check | `npm run typecheck` |
| Unit tests (Vitest) | `npm test` |
| End-to-end tests (Playwright for Electron) | `npm run test:e2e` |
| Build renderer, main and preload | `npm run build` |
| Package installers locally (unsigned) | `npm run dist:mac`, `npm run dist:win`, or `npm run dist:dir` (unpacked app only, fastest) |
| Check the repo for student data or secrets | `npm run check:no-student-data` (also runs on every commit) |
| Check a GitHub Release has every updater file | `npm run verify:release-assets -- v0.0.2` |
| Release | bump `version` in `package.json` and `package-lock.json`, commit, then `git tag vX.Y.Z && git push origin vX.Y.Z` |

## Folder layout

The target layout is SPEC.md section 8.3. Short version:

```
src/main/       Electron main process: db/, file/, import/, allocate/, codes/, render/, update/, ipc/
src/preload/    typed window.api bridge, generated from the shared IPC contract
src/renderer/   React UI only
src/shared/     types, Zod schemas, IPC contract, brand.ts, terminology
resources/      icons, fonts, sample logo, demo data generator
tests/          unit/ (Vitest), e2e/ (Playwright), fixtures/ (SYNTHETIC only), golden/
docs/           user-guide.md, it-guide.md, signing.md, release-checklist.md
.github/        workflows/ci.yml, workflows/release.yml
```

Development run: `npm run dev` starts Vite with hot reload and opens the app; the updater
is disabled in a development build and says so. End-to-end tests drive the BUILT app, so
`npm run build` must come before `npm run test:e2e`.

## Conventions

- TypeScript strict. No `any`. Zod validates every IPC payload in the main process.
- Pure core (`allocate/`, `codes/`, name case, group mapping, import validation and
  diffing) has no Electron imports and carries the most tests, including property tests
  with fast-check.
- Conventional commits: `feat(scope): ...`, `fix(scope): ...`, `ci: ...`, `docs: ...`.
  Release notes are generated from commit subjects, so write them for school staff.
- Never commit real student data. Only synthetic fixtures, inside `tests/fixtures/` or
  `resources/demo/`, each carrying a `SYNTHETIC` marker. A pre-commit hook enforces this
  (M0). `.gitignore` already refuses `*.lockers`, `*.csv`, `*.xlsx` elsewhere.
- Never commit secrets. Signing secrets are GitHub Actions secrets only (docs/signing.md).
- Minimum footprint: touch only what the task needs. Mention nearby problems, don't fix them.

## Branches and releases

- `main` is the only long-lived branch. Work on short feature branches when a change is
  more than a day's work; otherwise commit straight to `main` in small steps.
  This overrides the global "work on `test`" rule: this repo has no server environment to
  test against, CI runs on every push, and releases happen only on tags.
- Releases are tag-driven (`v*.*.*`). CI must be green before tagging.
- Every milestone ends with a tagged GitHub pre-release and proof that the previous
  pre-release auto-updates to it.
- The app accepts GitHub pre-releases while its own version is below 1.0.0, and only
  stable releases from 1.0.0 on (see Decisions).

## Decisions made so far (and why)

1. **Repository root is `/Users/davidarmstrong/Antigravity/LockerManager`**, not
   `~/Documents/LockerManager` as the kick-off prompt said. The global rule is that all
   code lives under `Antigravity/`; the Documents folder holds only Dave's copy of
   SPEC.md and START-PROMPT.md. SPEC.md was copied here unchanged.
2. **No named WHS preset** (Dave, 6 Oct 2026). The defaults still reproduce the WHS
   working set-up (SPEC.md principle 6): 228 lockers split 114/114, Homeroom terminology,
   the code rules in section 4.6, Avery L7163 at the measured 14.0 mm top and 38.0 mm
   height. They are labelled as defaults, never as "WHS".
3. **MIT licence** (Dave, 6 Oct 2026). LICENSE is at the root.
4. **Public repository.** Needed so the updater needs no token and Mac and Windows CI
   minutes are free.
5. **Pre-releases and auto-update.** electron-updater ignores releases GitHub marks as
   pre-release unless `allowPrerelease` is on. Rule: `allowPrerelease = version < 1.0.0`.
   Milestone releases are GitHub pre-releases; 1.0.0 onwards are normal releases, and the
   beta channel (`1.3.0-beta.2`) uses semver pre-release suffixes as SPEC.md 9.1 says.
6. **Windows code signing**: Azure Artifact Signing (the new name for Azure Trusted
   Signing) lists Australia as a supported country for organisation validation as of
   October 2026. Earlier notes in the redaction tool repo saying it was unavailable here
   are out of date. Validation is of an organisation, not a person (docs/signing.md).
7. **Main process and preload are CommonJS** (`out/main/index.cjs`, `out/preload/index.cjs`)
   even though package.json says `"type": "module"`. electron-updater and electron-log are
   CommonJS packages whose named exports fail from an ES-module main process, and a
   sandboxed preload must be CommonJS with no runtime imports. `src/shared/channels.ts`
   holds the IPC channel names with no dependencies for that reason; `src/shared/ipc.ts`
   adds the Zod schemas and is imported by main and (types only) by the renderer.
8. **One Windows installer for x64 and arm64** (electron-builder's multi-arch NSIS), named
   `Locker-Manager-Setup-<version>.exe`; one universal Mac DMG and ZIP named
   `Locker-Manager-<version>-universal.<ext>`. Names are set explicitly in
   electron-builder.yml so the release checker and the notes template can rely on them.
9. **Playwright launches the project folder** (`electron.launch({ args: ['.'] })`), not the
   built file, so Electron reads package.json and `app.getVersion()` is ours.

10. **M1 scope decisions** (Dave, 6 Oct 2026). The conflict screen in M1 lets the operator
    keep one whole version (the other is always kept as a dated backup); change-by-change
    merging arrives in M4. Every release runs an automatic update proof on GitHub's
    Windows and Mac machines (job `prove-update` in release.yml).
11. **Migration 001 is the whole SPEC.md section 3 data model**, so the migration machinery
    is exercised from the first release. Later milestones add numbered migrations; never
    edit a migration that has shipped in a release.
12. **If a backup cannot be written, the save still goes ahead** and the operator sees a
    warning. Refusing to save would leave the only copy of their changes in memory, which
    is the bigger risk; the original file is untouched until the final rename either way.
13. **sql.js traps** (verified 6 Oct 2026, sql.js 1.14.2, SQLite 3.49.1): `db.export()`
    switches `foreign_keys` OFF and invalidates every prepared statement. `src/main/db/db.ts`
    re-applies the pragmas after each export; never keep a prepared statement across a save.
    JSON functions are available. `initSqlJs()` with no options finds its own WASM file,
    including inside the packaged app's asar, so sql.js must stay in `dependencies`.
14. **Letters are built from sections, not free rich text** (explained to Dave 6 Oct 2026,
    and shown to staff at the top of Settings, Letters). A template is an ordered list of
    blocks (heading band, stripe, student panel, words, picture, space), each shown for all
    locks or one kind, with words per language. This keeps every letter to one page and
    makes the WHS layout the default. Words use a tiny format: blank line, `- `, `1. `,
    `**bold**`, `{merge_field}`.
16. **PIN, not passphrase, for 1.0** (SPEC.md 17 item 5). An optional PIN (scrypt hash in
    setting `privacy`) gates showing, printing and exporting codes; unlock lasts 10 minutes in
    main-process memory and resets when another file opens. A passphrase that wraps the code
    key is left for later: losing it loses every code, which is the bigger risk for schools.
17. **Codes returned by assign, move and new code are logged as reveals** (`shownCode` in
    `src/main/privacy.ts`). Before M8 they reached the screen without a reveal log entry.
15. **Anything with codes prints or exports only in edit mode** (Dave, 7 Oct 2026). Every
    code that leaves the app is written to `code_reveal_log`, which needs a write. The rule
    is stated next to every print button that can carry codes, in the user guide and in
    the IT guide. The screen never shows codes in previews; they are masked.

## Known, accepted

- `npm audit` reports sprintf-js (moderate, denial of service) through electron-builder's
  own dependencies. It runs only on the build machine and is not inside the shipped app.
  No fixed electron-builder exists as of 6 Oct 2026; re-check after each electron-builder bump.
- The renderer bundle is about 870 kB. Loaded from disk inside Electron this is
  instant; look at it only if start-up ever feels slow.

## Lessons carried over from Dave's other desktop apps

From `~/Antigravity/redaction tool/CLAUDE.md` and `~/Antigravity/jacks iep generator/`:

- **Create the GitHub Release once, in its own job, before the Mac and Windows builders
  run.** Two parallel `electron-builder --publish` runs each created a release for the
  same tag; the empty one won the download URLs and every installer 404'd.
- **`mac.identity: "-"` is required** for ad-hoc signing. electron-builder 26.15 no
  longer ad-hoc signs by default when no certificate is present, and an unsigned app
  reports as "damaged" on Apple silicon.
- **A version-check job must fail the release in seconds** if `package.json` does not
  match the tag. A mismatch puts installers on the wrong release and users are told they
  are up to date forever.
- **Published asset names replace spaces with dashes** (`Locker-Manager-Setup-0.0.2.exe`).
- **Release notes must carry the first-launch security-warning steps** for both
  platforms, every release, because staff reach the release page from the update prompt
  and never read the README.
- Squirrel.Mac rejects an update whose signature does not match the running app, so an
  unsigned Mac build can only detect updates and open the download page (SPEC.md 9.2).

## Where things live (M1)

- `src/main/db/`: sql.js wrapper (`db.ts`), migrations (`migrations/NNN_*.sql`, imported
  with `?raw`), audit and meta helpers (`context.ts`), new file (`newFile.ts`), summaries
  and history differences (`summary.ts`).
- `src/main/file/`: all of SPEC.md section 6, Electron-free. `session.ts` owns the open file
  (open, debounced save, heartbeat, read-only polling, conflicts, copies, backups, restore);
  `atomicSave.ts`, `lockFile.ts`, `backups.ts`, `siblings.ts`, `readDataFile.ts` are the
  pieces. Every file-system call goes through `FsPort` so tests inject faults.
- `src/main/fileService.ts`: the only Electron glue for the data file (dialogs, IPC, demo).
- `src/main/prefs/preferences.ts`: per-computer settings (operator, recent files).
- `src/main/demo/demoSchool.ts`: the synthetic WHS-shaped school, deterministic by seed. It
  is also the fixture for the M4 golden allocation test.
- `tests/unit/file/faultyFs.ts`: fault injection; `tests/crash/`: the real kill-during-save
  test (bundles a child with esbuild); `tests/e2e/launch.ts`: launches the built app with
  its own `--user-data-dir`, which also gives each copy its own single-instance lock, and
  answers native dialogs through `app.evaluate`.
- `tests/fixtures/schema/vN-SYNTHETIC.lockers`: one file per released schema version. The
  fixture test writes the newest one if missing; commit it with any new migration.

## Data requests (since M2)

All data reads and writes from the window go through ONE channel, `rpc`:
- `src/shared/rpc.ts`: every method with its Zod input schema (`rpcParams`) and result type
  (`RpcResults`). Adding a feature = add the method here first.
- `src/main/rpc/handlers.ts`: one entry per method: `read` (runs on the open file),
  `write` (runs inside `session.write`: read-only and conflict checks, transaction, history
  entry from `audit(params, result)`, debounced save) or `pure` (no file needed). TypeScript
  refuses to build if a method has no handler.
- Renderer: `useRpc(method, params)` fetches and refetches when the file's `revision`
  changes; `call(method, params)` throws a plain message; `useAction()` shows it.
- Repositories in `src/main/repos/*.ts` are plain functions on `LockerDb`, unit-tested
  without Electron. They take an `OperatorContext` for timestamps.
- The window's words come from `useTerms()` (terminology); never hard-code "Homeroom",
  "Locker" and so on in UI text.

## Gotchas found in M1

- React's `react-hooks/set-state-in-effect` lint rule forbids resetting form state in an
  effect when a dialog opens. Put the form in a child component inside the Radix dialog
  content instead; it mounts fresh each time the dialog opens.
- In dark mode `--color-brand` lightens for contrast, so large panels use `--color-panel`
  (deep teal in both modes). Use `bg-panel text-on-panel` for hero bands.
- A save whose final `stat` fails after a successful rename must still count as saved; the
  property test found this.
- `--user-data-dir` is honoured by Electron for `app.getPath('userData')`; no test hook needed.
- Prettier reflows long lines, so scripted find-and-replace edits against source often miss.
  Use the Edit tool on freshly read text.
- Windows reports an installed app's version with four parts (0.1.0.0).
- Windows CI runners are slow at file operations: the atomic-save property test took over
  5 seconds there, so `vitest.config.ts` gives tests 30 seconds on CI. v0.3.0 was never
  tagged because of this; M3 shipped inside v0.4.0.
- Chromium's printToPDF sets page sizes in steps of about 0.24 pt: with `preferCSSPageSize` an
  A4 page is 594.96 x 841.92 pt (0.11 mm narrow); giving `pageSize` in inches is worse
  (0.23 mm wide). Content is laid out from the top-left in exact CSS mm, so label positions
  are unaffected; the labels e2e test allows 0.15 mm on page size and checks text positions.
- `scripts/release.sh` stops if CI fails. Do not pipe it through `tail` in the background:
  the pipe hides its exit status.
- Node's `TextDecoder('windows-1252')` is really Latin-1: it turns Excel's curly apostrophe
  (0x92) into a control character. `src/main/import/decode.ts` maps 0x80 to 0x9F by hand.
- Year levels are stored as plain text numbers ("7"), never "Year 7"; screens add the
  terminology word. Groups are stored as the export code ("07A"); `groups.displayMap`
  (setting) gives the display ("7A").
- Import presets live in `src/shared/importPresets.ts` so the window can re-match columns
  instantly when the operator picks another header row.
- `codeKey(db)` CREATES the key if the file has none. Inside `session.read` use
  `readCodeKey(db)` instead, or a read silently changes the file.
- Letters are measured in a hidden window with JavaScript on (`overflowingLetters` in
  `src/main/render/pdf.ts`); the page itself carries a CSP that forbids scripts. Labels and
  PDFs are rendered with JavaScript off.
- Never pipe `curl` into `grep -q` in a workflow: grep stops early, curl reports a write
  failure, and pipefail fails the step even though the text was found.

## Current milestone

**M1: data file and safety.** Built 6 Oct 2026: the `.lockers` file, migrations, atomic
save, edit lock, read-only mode, takeover, conflict and sync-copy screens (whole-version
choice), backups with preview and restore, the demo school, and the automatic update proof
in release.yml. Releasing as v0.1.0. Backups stay on every save (SPEC.md 6.5);
over the size cap, recent bursts are thinned to one per 10 minutes before older history is
touched. v0.1.0 released; update proof passed on Windows (0.0.2 installed 0.1.0 by itself)
and Mac (download page offered).

**M2: set-up and locations.** Built 6 Oct 2026: set-up wizard, school profile with logo and
automatic mono version (with the white-on-transparent warning), terminology presets,
areas, banks, bulk locker builder with preview, the Lockers screen, out of service,
reserve, accessible, shared lockers, the deliberate Renumber tool, lock kinds per bank.
v0.2.0 released; update proof passed automatically on Windows and Mac.

**M3: import.** Built 6 Oct 2026: CSV (any delimiter, BOM, UTF-16, Windows-1252), XLSX
(exceljs), XLS and ODS (SheetJS from cdn.sheetjs.com, not npm), pasted tables; header-row
detection; presets (Compass confirmed; Sentral, SIMON, Xuno, Synergetic, TASS, CASES21 best
known); name case with Mac, particle and two-word flags; group display mapping; year level
from column, group code or file; validation; comparison; apply; possible leavers limited to
the year levels imported; exclusions (ZZZ by default in new files); Students screen with
name checks and corrections that survive imports. Migration 002 adds
`student.not_in_import_since` and `student.name_check`. v0.3.0 released.

**M4: codes and allocation.** Built 6 Oct 2026. Codes: rules (src/main/codes/rules.ts),
secure or seeded generation, AES-256-GCM at rest with the key in meta `code_key_v1`
(src/main/codes/cipher.ts), code sets for next year (one per locker, never last year's) and a
spare pool, reveal logged in `code_reveal_log`. Lock code states: `reset_no_code` (on 0000) ->
issue -> `set`; holder changes -> `needs_new_code`; recode or swap -> `awaiting_physical_reset`;
"Reset done" -> `set` or `reset_no_code`. Allocation engine (src/main/allocate/engine.ts) is
pure; the golden test runs it on the demo school and its reference output is the snapshot in
tests/unit/__snapshots__/allocation.test.ts.snap (checked by eye 6 Oct 2026). Manual tools:
assign (suggests first spare in the student's area), release, move, swap. Undo and redo:
session snapshots before each write (50 steps, 200 MB cap); history lines written since a
snapshot are copied into it, so history stays append-only. History screen, Ctrl+K quick find,
Ctrl+Z undo. v0.4.0 released; update proof passed on Windows and Mac.

**M5: labels.** Built 6 Oct 2026. Stocks in src/main/render/stocks.ts (published Avery
geometry; measured values saved as overrides; custom stocks), geometry maths in
src/shared/labelGeometry.ts, Layout A designed on a 99.1 x 38 mm label and scaled
(src/main/render/layout.ts), auto-fit with fontkit measuring the bundled Arimo font
(src/main/render/fit.ts: shrink by 0.5 pt, then two lines, then report too long), sheets
as HTML in exact mm (labelSheet.ts), printed to PDF by a hidden window with JavaScript off
(pdf.ts), calibration page with 100 mm scale bar and rulers, printer nudges by name,
designer with drag, resize and 0.5 mm snap. The default stock is L7163 at the published
figures, not WHS's measured ones (no named WHS preset); the "Measure your sheet" helper
covers the low-printing problem. Golden image tests/golden/labels-L7163-sheet1.png is
checked on macOS only (fonts render differently on Windows); the e2e test checks text
positions in the PDF with pdf.js on every platform. Releasing as v0.5.0. Next: M6 letters
and reports.

**M6: letters, reports and exports.** Built 6 and 7 Oct 2026. Migration 003 adds the
`image` table (school's own pictures). Letters: `src/shared/letters.ts` (model),
`src/main/letters/` (standard template, word format), `src/main/render/letter.ts` (HTML in
mm), `src/main/repos/letters.ts` (who gets a letter, held back reasons, languages via
`student.custom.language`), `src/main/documentService.ts` (save, print, overflow check,
page count check, reveal log). Reports: `src/shared/reports.ts`, `src/main/reports/build.ts`
(eight reports), `src/main/render/report.ts` (tables, CONFIDENTIAL watermark, page-number
footer), `src/main/reports/export.ts` (CSV with BOM and formula guard, XLSX). Whole-file
export and rebuild: `src/main/portable/workbook.ts`. Screens: Letters, Reports, Settings
Letters (designer), student panel letter and language. v0.6.0 released.

**M7: year rollover and keys.** Built 7 Oct 2026. `src/main/repos/rollover.ts`: progress in
setting `rollover.progress` (so it survives closing the file and works for a second
person), self-reset record (`recordOnZero`: settable locks to `reset_no_code`, code
cleared, history closed), archive (typed `START <year>`, ends current assignments with
`year_rollover`, locks still on a known code to `needs_new_code`, old year archived, new
year active, an unused year code set made before the rollover moves to the new year),
promote (year level + 1, last year level marked left). The window keeps a named backup
first through `file:namedBackup` (`session.keepNamedBackup`). Key register:
`src/main/repos/keys.ts`, panel in the Lockers screen for keyed locks. v0.7.0 released.

**M8: polish.** Built 7 Oct 2026. In-app guide (`src/renderer/src/help/`, docs/user-guide.md
read with `src/shared/markdown.ts`, "Show me" map by section slug), problems panel
(`src/main/repos/problems.ts`), practice copy (`file:practice`, meta `practice`), PIN and
auto-hide (`src/main/privacy.ts`, `PinGate` in the window), settings file
(`src/main/portable/settingsFile.ts`), this computer's settings (`src/main/computerService.ts`:
theme through `nativeTheme`, text size through zoom factor, high contrast through
`data-contrast`, update channel and automatic install), managed settings
(`src/main/managed.ts`, `LOCKER_MANAGER_MANAGED` overrides the path for tests), start-up
recovery page (`src/main/recovery.ts`, packaged builds only), accessibility test with axe-core
in light and dark (tests/e2e/accessibility.spec.ts, reduced motion so colours are final).
The left menu becomes a top row in narrow windows and at large text sizes. Releasing as
v0.8.0. Next: 1.0 after Dave's hand checks (real label sheet on a laser printer, letters on
paper, a Windows PC install, signing when bought).

**Promised items closed after M8** (7 Oct 2026). Per-change conflict merge (Dave chose it for
M4; it was missed until now): the session keeps a journal of unsaved changes with each rpc
method and its input (`session.write(..., replay)`), and `mergeConflict` loads the other
version and replays the ticked changes through `replayChange` in `src/main/rpc/registry.ts`,
skipping any that throw. History "Put back to before this…" (`src/main/restoreRecord.ts`)
reads the student or locker from the first backup after the change that does not yet hold
its history line. Label QR links open the locker (`src/main/links.ts`). Landing page draft
in `site/index.html`, not published (GitHub Pages needs Dave's yes).

**Independent review fixes** (7 Oct 2026, before v0.9.0). Undo copies history rows into the
older snapshot with foreign keys off, and puts the step back if it fails. Every file with
codes is recorded first, then written (`pickOutputPath`, record, `writeOutput`). The
whole-file export records every locker with a current, past or next-year code, plus one
line for the spare pool (`lockersWithAnyCode`, `logReveal`). Letters "changed" is per
locker, from `print_job.records`. A year code set made while lockers are out is reserved
(setting `codes.reservedForNextYear`), skipped by `nextCodeFor`, and moved to the new year by
`archiveYear`. A PIN change empties the undo list. A practice copy is recorded in the real
file. Workbook import drops logo types the app does not make.
