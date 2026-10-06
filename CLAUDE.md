# CLAUDE.md: Locker Manager

Working notes for Claude Code. Keep this short and current. Read SPEC.md before any
non-trivial change; it is the full product and technical specification, and section 15
("Lessons from the real WHS deployment") is a list of hard requirements, not background.

_Last updated: 6 October 2026 (M0 released: v0.0.1 and v0.0.2)._

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

## Current milestone

**M0: skeleton and pipeline.** Built and released 6 Oct 2026: v0.0.1 and v0.0.2 are
published pre-releases with every updater file. Proven on the Mac: an installed v0.0.1
(ad-hoc signed, unsigned) found v0.0.2 thirty seconds after launch and showed "Version
0.0.2 is available" with "Open the download page". Still to be seen by Dave: v0.0.1 on
his Windows PC updating itself to v0.0.2 (installer at
https://github.com/mrdavearms/locker-manager/releases/tag/v0.0.1). Next: M1, the data
file and its safety rules (SPEC.md section 6).
