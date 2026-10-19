# Stability and reliability audit, 20 October 2026

Version audited: 0.11.4 (commit 9abac61). The report below was written first, with nothing fixed. Dave then asked for all 22 to be fixed; the status of each is in the next section. Nothing has been released.

## Fix status (20 October 2026, same branch)

Each fix has its own commit with a test that fails without it, except where the table says otherwise. All unit tests, lint, formatting, type-check and the end-to-end suite pass on this Mac.

| Finding | Fix | Commit | Shown working by | Not yet checked |
|---|---|---|---|---|
| 1 Undo broken links | Undo clears a link the older copy lacks; migration 005 repairs affected files; `migrate()` fails only on links it breaks | ed49eaa | Unit tests; the audit's proof test now opens the file | |
| 2 Windows install loop | `update-attempt.json`: a failed install is offered as a download, not retried; per-machine copies a standard account cannot change go to download-page mode | 64232ee | Unit tests of the rules and the record | A real Windows PC (hand check 9 in docs/release-checklist.md) |
| 3 Invisible app after a start-up error | Start-up in one try/catch; recovery page with the error; updater still starts | e9011ae | End-to-end test with a forced start-up failure | |
| 4 Release checks | `--self-test`; onward update proof before publishing on both platforms; rollout 0 withdraws; self-test after the update proofs | 03e3d3f | Mac onward proof run on this Mac (0.11.4 updated itself to 0.11.5 after an earlier self-update); YAML parses | The Windows onward proof and the workflow changes run only on GitHub: the first release run is their test |
| 5 No way to open a backup | **Open a backup…** on the first screen | df32238 | Unit and end-to-end tests | |
| 6 Lost changes at quit and update | Save first, then ask (Try again, Close anyway, Cancel); update refused while unsaved | 5a02b9f | End-to-end test with a read-only folder | |
| 7 Windows shutdown, own lock after a crash | `session-end` saves, backs up and releases the lock synchronously; next start says where the backup is; own stopped copy's lock is free | 4f9cd5c | Unit tests of the shutdown save and the lock rule | The Windows shutdown event itself (hand check 10) |
| 8 Two editors on OneDrive | Copies looked for at every check, shown in the bottom bar; ignored by name, size and time; saves wait a minute after waking | cf33ac5 | Unit tests | |
| 9 Backup flood | No second backup of the same version; a crowded last hour is thinned before older history | 05551bf | Unit tests (5 retries make 1 backup; daily backups survive) | |
| 10 Lock clocks | Lock also judged by this computer's clock; held reads retried | 8904748 | Unit tests | |
| 11 managed.json byte-order mark | Mark removed before reading | 64232ee | Unit test | |
| 12 Hung share blocks quit | Saves at close wait at most 20 seconds, then back up | f240b6a | Unit test | |
| 13 Older copy edits a newer file | Takeover, keep theirs and merge go read-only and give back the lock | f240b6a | Unit test | |
| 14 Failed takeover leaves a lock | File read before the lock; lock given back on failure | f240b6a | Unit test | |
| 15 One bad field resets preferences | Each field falls back on its own | e9011ae | Unit test | |
| 16 Preference writes out of order | Writes queued; renames retried | e9011ae | Unit test | |
| 17 File double-clicked during start-up | Waits until start-up has finished | e9011ae | Traced | |
| 18 Mac recovery window | Closing it quits | e9011ae | End-to-end test | |
| 19 Mac install stopped between renames | Script puts the old app back when stopped; IT guide covers a power cut | b3c0197 | Unit test that stops the script between the renames | |
| 20 macOS asking again for folder access | Not fixable in code while unsigned | b3c0197 (hand check) | | Hand check 11 on a real Mac |
| 21 Unsigned release after signing | `REQUIRE_SIGNING` repository variable stops the release | 03e3d3f | | Runs only on GitHub |
| 22 Authenticating proxy | Not fixable without knowing the proxy | b3c0197 (hand check) | | Hand check 12 on a school network |

Start-up findings F2, F3, F10 and F11 from the detail file are fixed in e9011ae (start counted first and reset only when the app has drawn; error page with Reload and reload after a crash; the database engine retried and not reported as a damaged file; graphics turned off after a graphics process failure).

One side effect to know about: migration 005 means the next release changes the file's schema. Once a computer with the new version opens a school's file for editing, computers still on 0.11.x open that file read-only, saying a newer version made it, until they update themselves (which they do at their next start).

The question asked: is there anything else as serious as the 0.11.0 to 0.11.3 Mac update fault? That is, anything the app leaves on disk, or any single fault, that could stop installed copies updating or starting, lose or damage a school's `.lockers` file, or lock a school out of it.

The short answer is yes. Four findings are of that severity:

1. Undo leaves broken links inside the file. The first release that adds a database migration will then refuse to open every affected school's file, on every computer (finding 1, proven).
2. On Windows, an update that cannot install can make the app quit by itself every time it is opened (finding 2, traced, not reproduced on Windows).
3. Any error during start-up leaves an invisible copy running that blocks every later launch and never updates (finding 3, proven).
4. The release checks would let a fault like the 0.11.0 one ship again, and a bad release cannot be withdrawn once published (finding 4).

## How this was done

- Read CLAUDE.md, SPEC.md sections 6, 9 and 15, and the code in `src/main/update/`, `src/main/file/`, `src/main/db/`, `src/main/index.ts`, `src/main/recovery.ts`, `src/main/prefs/`, `src/main/managed.ts`, the release workflows and `scripts/update-proof/`.
- Traced electron-updater 6.8.9 (`NsisUpdater.js`, `BaseUpdater.js`) and electron-builder's NSIS installer template (`installer.nsi`, `multiUser.nsh`) line by line.
- Wrote proof tests against the real code with the synthetic demo school, and small Electron 44.5.1 reproductions. They are kept in `docs/audits/2026-10-20-stability-audit-evidence/`, with their output. The test file is stored as `.txt` so it does not run with the normal tests; copy it to `tests/unit/file/` to run it.
- "Proven" means a test or reproduction shows it. "Traced" means the code path was followed line by line but not run on the platform concerned. "Unproven" means it depends on behaviour outside the code that could not be checked here.

Likelihood is for a typical school using the app for a year. Size is a rough guide: small is under a day, medium one to three days, large more.

---

## Finding 1. Undo leaves broken links; the next release with a migration cannot open the file (critical, proven)

**What goes wrong.** Undo goes back to an earlier copy of the database, then copies every newer history, code-reveal and print record into it, with the link check (SQLite's foreign key check) switched off. A code-reveal record points at a student and a locker. If the student or locker did not exist in the earlier copy, the record now points at nothing.

Example: add a student by hand, assign them a locker (the code shown is logged as a reveal), then press Undo twice. The file now holds a reveal record for a student who does not exist.

Nothing notices this today. But `migrate()` runs a full link check after migrating and refuses the file if anything is broken. So the first release that adds migration 005 will refuse to open every file that has ever had this sequence, in edit mode and in read-only mode, on every computer that has updated. The named backup taken before migrating has the same broken link, so restoring it fails too.

**Where.**
- `src/main/file/session.ts:505-526`: records copied with the check off.
- `src/main/db/migrate.ts:66`: `if (db.foreignKeyProblems() > 0) throw`.
- `src/main/file/session.ts:367-391`: any migration failure closes the file, read-only viewers included.
- `src/main/file/session.ts:834` and `:1118`: the same check runs on takeover, keep-theirs, merge and restore.

**Likelihood.** Medium. Adding a student and then undoing is ordinary use; so is undoing past any locker or student that later got a reveal or print record. It stays hidden until a migration ships, then hits every affected school on the same day.

**How bad.** Critical. The school cannot open its file at all, and the app offers no way round it (see finding 5).

**Evidence.** Proof test 1 (`datafile-proofs.test.ts.txt`): demo school, add student, assign and log the code, undo twice, save. Output: `foreign key problems after two undos: 1`. Reopened by a build with one extra empty migration: `This file could not be updated for this version of the app (Foreign key check failed after migrating.). The file was not changed.` Re-run by me on 20 October 2026: 4 of 4 proof tests pass.

**Suggested fix.** Medium.
1. In `migrate()`, count broken links before and after, and fail only on new ones. This must land before any release that adds a migration.
2. In the undo step, set `student_id` and `locker_id` to empty (both allow it) on copied reveal rows whose student or locker is missing; check `print_job` the same way.
3. Add a one-off repair that clears existing broken links, run inside the next migration.
4. Add the proof test to the unit tests.

---

## Finding 2. Windows: an update that cannot install can quit the app on every launch (high, traced)

**What goes wrong.** Since 0.11.0, an update found before any file is open installs straight away (`installAtStartup`, decision 25). On Windows nothing remembers a failed install. The Mac has `macFailed` (updater.ts:140, :169); Windows has no equivalent.

If the Windows installer cannot finish, the app has already quit, and the installer does not reopen it. The next time staff open the app, electron-updater finds the download already in its cache, reports it ready within about a second, and the app quits to install again. The "Skip for now" button is on screen for only a few seconds. To staff, the app opens and then vanishes, every time.

The most likely trigger is the install route the IT guide recommends for schools. IT installs for all users (`/S /allusers`, into Program Files). Later a standard staff account runs the app. The update installer is per-user by default, so `latest.yml` does not mark it as needing admin rights. When it starts, it finds the per-machine install and asks Windows for admin rights (the template's silent per-machine upgrade branch). A staff member without an admin password cancels the prompt; the template treats cancel (code 1223) as "quit quietly". Other triggers: an antivirus or application-control policy (common in school fleets) that blocks the unsigned installer.

The same failed install also runs on every ordinary quit, because `autoInstallOnAppQuit` is on, so staff see the admin prompt each time they close the app.

**Where.**
- `src/main/update/updater.ts:266-285` (`onReady` installs at once), `:330` (`quitAndInstall(true, true)`).
- `src/main/update/policy.ts:107-113` (`installAtStartup` has no failure input).
- `node_modules/electron-updater/out/NsisUpdater.js:101-140` (no elevation unless `isAdminRightsRequired`).
- `node_modules/app-builder-lib/templates/nsis/installer.nsi:96-118` (silent upgrade of a per-machine install asks for elevation, and quits on cancel).
- Made worse by finding 11: if IT writes `managed.json` with Windows PowerShell 5.1, the byte-order mark makes the app ignore `autoUpdate: false`, so IT's attempt to turn updates off does not work either.

**Likelihood.** Medium in schools where IT installs for all users. That is the documented IT route, and the most likely set-up at a school with a managed fleet.

**How bad.** High. Staff cannot use the app on that computer until IT intervenes, and nothing on screen says why.

**Evidence.** Traced through the three files above. Not reproduced on a Windows computer: the update proof only ever installs per user.

**Suggested fix.** Medium.
1. Before a Windows install, write the version being installed to preferences. At start-up, if the running version is still older than that version, treat it as a failed install: do not install that version at start-up again, and show "Version X could not be installed on this computer" with the download page, the way the Mac does.
2. Detect a per-machine install (install path under Program Files, or the HKLM uninstall key) on a non-admin account, and switch that copy to download-page mode, as `macBlocker` does on the Mac.
3. Add a per-machine install to the Windows update proof (finding 4).

---

## Finding 3. A start-up error leaves an invisible app that blocks every later launch and never updates (high, proven)

**What goes wrong.** All of start-up runs inside `void app.whenReady().then(async ...)` with no error handling, and there is no `process.on('uncaughtException')` or `unhandledRejection` handler. If any step before the window throws, the process stays running with no window and keeps the single-instance lock. Every later launch quits at once, because the lock is taken. Nothing is written to the log. On a Mac, clicking the Dock icon does nothing either, because the `activate` handler is added after the window is made. The updater is set up at line 117, after most of the steps that can fail, so this copy also never updates itself out of trouble.

A realistic trigger: preferences.json is written at every start (`noteStartAttempt`, and earlier in `initFileService`). That write throws on a full disk or a folder the account cannot write (both proven), and probably when Windows antivirus holds the file (not proven; there is no retry on rename in `fsPort.ts:41`).

**Where.** `src/main/index.ts:78-141`; `src/main/recovery.ts:19`; `src/main/prefs/preferences.ts:65-75` and `:109`; `src/main/fileService.ts:97`.

**Likelihood.** Medium over a year across many schools. A full disk on an old school laptop is ordinary.

**How bad.** High. Until the computer restarts or someone ends the process in Task Manager or Activity Monitor, the app cannot be opened. If the cause is permanent, the copy is stranded.

**Evidence.** `startup-error-repro.js.txt` (rename to `.js` and run with `npx electron` to repeat it) in Electron 44.5.1: a throw in the same promise chain prints only a console warning, and three seconds later the process is alive with `windows=0 lock=true`. A read-only and a full preferences folder were both shown to make the write throw. Details in `startup-findings-detail.md` (F1).

**Suggested fix.** Small.
1. Wrap start-up in try and catch. On failure, log it, show `dialog.showErrorBox` with what to do, then open the recovery page or call `app.exit(1)`.
2. Make the start-count write unable to stop start-up.
3. Set up the updater as early as possible, before the data-file service, so even a copy with a start-up fault can install a fixed release.
4. Turn on electron-log's error catching, and retry Windows renames in `fsPort`.

**Related, smaller start-up faults** (all in `startup-findings-detail.md`):
- **The recovery page cannot see the failures it was built for** (F2, medium). The start is counted at `index.ts:124`, after everything that can fail. The counter is reset on `did-finish-load`, which fires even when the window is blank because the window's code crashed. There are no tests of the recovery page. Fix, small: count first thing, and reset only when the window's code reports it has drawn the app.
- **A crash in the window's code leaves a blank window** (F3, medium). There is no React error boundary and no `render-process-gone` handler, and the packaged menu has no Reload. The data is safe because the main process saves on quit. Fix, small.
- **A failed sql.js start is kept for the whole session** (F10, medium, low likelihood). `src/main/db/db.ts:7` caches the failed load, and `session.ts:294-297` then reports every file as "not a data file or damaged". Staff could restore a backup they did not need. Fix, small.
- **No fallback when the graphics process keeps failing** (F11). On remote-desktop or virtual-desktop computers and old graphics drivers, Electron apps can exit at start. Fix, medium: turn off hardware acceleration after a graphics crash, and allow a `managed.json` setting for it. Unproven.

---

## Finding 4. The release checks would let a fault like 0.11.0's ship again, and a bad release cannot be withdrawn (high)

**What goes wrong.** Each of these is a gap on its own. Together they mean one bad release reaches every school within days, and cannot be pulled back.

1. **Nothing proves the new release can update onward.** The update proof shows the previous release updating to the new one. Whether the new one can install the release after it is first tested at the next release, after every school already has it. That is exactly how 0.11.0 to 0.11.3 shipped.
2. **The proof runs after the release is public and marked latest.** Copies check 3 seconds after launch and install at start-up, so schools take the release while the proof is still running. A failed proof does not withdraw it.
3. **There is no way to withdraw a release.** `rollout.yml` accepts 1 to 100 per cent, not 0, and docs/signing.md plans immutable releases, after which the update files cannot be changed at all. The only remedy is a higher version, which works only if the bad version can still update.
4. **"The new version starts" proves very little.** Both proofs look for the log line `Locker Manager X starting`, written at `index.ts:97`, before the data-file service, the window, sql.js or any file. A release that crashes later in start-up, or shows a blank window, passes.
5. **The packaged app is never tested end to end.** CI's end-to-end tests run the unpacked build from the project folder. sql.js's WASM file inside the asar, fonts from `resourcesPath`, the recovery page and the start-up install are only seen in the update proof, which opens no file.
6. **The Windows proof only installs per user.** The per-machine install recommended to IT (finding 2) is never tested. The Windows proof also never starts from a copy that has already updated once, the lesson learned on the Mac.
7. **The Mac proof runs from the runner's temporary folder, launched directly**, not from /Applications through Finder. So macOS App Management (macOS 13 and later), quarantine and translocation are never exercised. CLAUDE.md already says the Mac self-install is not yet proven on a real Mac.

**Where.** `.github/workflows/release.yml:278-279`, `.github/workflows/update-proof.yml`, `.github/workflows/rollout.yml:44`, `scripts/update-proof/mac.sh`, `scripts/update-proof/windows.ps1`, `.github/workflows/ci.yml:56-63`.

**Likelihood.** The gaps are certain; a fault slipping through them is a matter of time. It has already happened once.

**How bad.** High. A release that cannot update onward, or that cannot start, strands every school, and each needs a manual install.

**Suggested fix.** Large overall, but in pieces.
1. **Prove onward updating before publishing** (medium to large). Build the release, then build the same commit again with a higher test version number. Serve that from a local web server through electron-updater's generic provider; a hidden environment variable can point the updater there. Prove on both platforms that the release installs it by itself, starting from a copy that has already updated once. Only then publish.
2. **Make "it starts" mean the app is usable** (small). The proof should wait for a log line written after the window's code has drawn the app, and should open the demo school, which exercises sql.js inside the asar.
3. **Keep a way to withdraw a release** (small). Allow 0 per cent in `rollout.yml`. If immutable releases are switched on, decide first how a bad release would be stopped: for example, publish at 0 per cent, run the proof, then raise to 100.
4. **Add a per-machine Windows proof** (small) with a standard user account, once finding 2 is fixed.

---

## Finding 5. A damaged or unreadable school file cannot be recovered from inside the app (high, proven)

**What goes wrong.** When a file fails its integrity check, the app says to "Open a backup from the 'Locker Manager backups' folder beside it". The app gives no way to do that. Backups are compressed `.lockers.gz` files. The Open dialog shows only `.lockers` files, double-clicking needs a name ending in `.lockers`, and opening cannot read compressed files. The Backups screen lists nothing unless a file is already open. Only the start-up recovery page explains how to unzip a backup by hand.

**Where.** `src/main/file/session.ts:299-306` and `:1087`; `src/main/file/readDataFile.ts:64-65`; `src/main/fileService.ts:64` and `:146`.

**Likelihood.** Low, but this is the path every other data fault ends in, including finding 1.

**How bad.** High. The school needs IT to unzip and rename a backup, or is stuck.

**Evidence.** Proof test 4: opening a `.lockers.gz` gives "This is not a Locker Manager data file, or it is damaged…", and the backup list with no file open is empty.

**Suggested fix.** Medium. When opening fails as damaged, or a migration fails, offer "Open a backup instead". List the shared and local backups for that file name with their dates, preview one, and restore it as a new file beside the original.

---

## Finding 6. Unsaved changes are lost without warning when a save keeps failing at quit or update (medium-high, traced)

**What goes wrong.** If the final save fails (antivirus or OneDrive holding the file, a network share offline), `close()` keeps the changes as a local backup labelled "unsaved changes at close" and shows a warning. But the warning is not waited for (`void dialog.showMessageBox`), and `before-quit` quits the app as soon as `close()` returns, so the warning disappears with the app.

During an update it is worse. `installUpdateNow` checks `unsavedChanges` after closing the file, but closing has already set it to false, so the check can never stop the install. The changes exist only in a local backup nobody is told about.

**Where.** `src/main/fileService.ts:85-88` and `:111-119`; `src/main/index.ts:155-165`; `src/main/update/updater.ts:320-328`.

**Likelihood.** Medium in synced folders.

**How bad.** Medium-high. Work silently missing from the school's file.

**Suggested fix.** Small. Check for unsaved changes after the last save attempt and before closing, and refuse the update if there are any. On quit, wait for the dialog and offer "Try again" or "Quit anyway (your changes are kept as a backup on this computer)".

---

## Finding 7. Shutting down Windows with the app open loses recent changes and leaves the lock behind (medium, traced)

**What goes wrong.** On Windows shutdown or log-off, Electron does not send `before-quit` or `will-quit` (Electron's documentation; not tested here), and there is no `session-end` handler. So the debounced save may not run, and the lock file is left. Changes from the last 2 seconds are lost, or all unsaved changes if saves were failing, with no backup.

After any unclean exit (crash, force-quit, power cut, shutdown) the same person on the same computer then sees "Being edited by (themselves) on (this computer)", with no takeover offered for up to 10 minutes, because each launch has a new session id and a lock only counts as "mine" on a matching session id.

**Where.** `src/main/fileService.ts:105`; `src/main/file/lockFile.ts:57`; no `session-end` handler in `src/main`.

**Likelihood.** Medium. Shutting down with the app open is routine.

**Suggested fix.** Small. Handle `session-end` on Windows by saving or writing a local backup and releasing the lock. Treat a lock as free when it names this computer and its process is no longer running.

---

## Finding 8. On OneDrive or Google Drive, two people can edit at once, and the app notices only at the next open (medium, traced)

**What goes wrong.** The hash check and the edit lock only see this computer's synced copy. Two staff opening the file within the sync delay can both get the lock. A laptop that sleeps for more than 10 minutes while a colleague takes over will, on waking, save against its own stale copy. The hash check passes, and its heartbeat rewrites its own lock. OneDrive then keeps one version and makes a conflict copy of the other. The app looks for conflict copies only when a file is opened, never while editing.

Also, "Ignore" on a sync copy is remembered by file name for ever. OneDrive names copies from the same computer the same way ("-OFFICE-PC"), so once one is ignored, a later real conflict copy with that name stays hidden.

**Where.** `src/main/file/atomicSave.ts:76,147`; `src/main/file/lockFile.ts:98-116,131-143`; `src/main/file/session.ts:395,405-428`; `src/main/prefs/preferences.ts:91-99`.

**Likelihood.** Medium for schools using laptops and OneDrive; low on network shares. This is the SPEC.md 15 item 17 risk (one person's work undone by another's), now only partly closed.

**Suggested fix.** Small to medium. Look for conflict copies on every heartbeat and read-only check, and show the banner while editing. Remember ignored copies by name plus size and modified time. After the computer wakes from sleep, re-read the lock and hash before the next save.

---

## Finding 9. A failing save writes a new identical backup every 10 seconds, and can push out all backup history (medium, proven)

**What goes wrong.** Each save attempt backs up the version on disk before writing the new one. Failed saves retry every 10 seconds, so each retry writes another identical backup, to both the shared and the local backup folders: up to 360 an hour, all uploaded by OneDrive. Pruning never thins the last hour. Once that hour alone exceeds the size cap, the "oldest first" step deletes every daily backup.

**Where.** `src/main/file/atomicSave.ts:89-100`; `src/main/file/session.ts:683-686`; `src/main/file/backups.ts:170` and `:184-191`.

**Likelihood.** Medium for the flood of identical backups. Low for losing history: the cap is reached at about 1.45 MB compressed per backup (about 4.4 MB uncompressed); the demo school is 504 KB uncompressed.

**Evidence.** Proof test 2: with the rename failing (EPERM), 5 save attempts made 5 identical backups, and the file stayed marked unsaved. Proof test 3: 90 daily backups and 2 named backups of 1.5 MB, plus 360 retries in the last hour. Pruning deleted all 90 daily backups and kept the 2 named ones and 347 retries.

**Suggested fix.** Small. Skip the backup when the file on disk has the same hash as the last one backed up.

---

## Finding 10. Stale-lock decisions mix two computers' clocks, and an unreadable lock counts as stale (medium-low, traced)

**What goes wrong.** The heartbeat time written by the editing computer is compared with this computer's clock. A slow clock on the editor's computer lets a live editor be taken over. A fast clock on a computer that then crashed locks everyone out for longer. Any lock read error other than "file not found" (EBUSY, EACCES or EIO while OneDrive or antivirus holds it, or a zero-byte placeholder) counts as a damaged lock, then as stale, so "Take over editing" is offered while someone is actively editing. A takeover sends the real editor to read-only; their unsaved changes go to a backup.

**Where.** `src/main/file/lockFile.ts:33-43,56-61`; `src/main/file/session.ts:1020-1040`.

**Suggested fix.** Small. Call a lock stale when its heartbeat value has not changed for 10 minutes by this computer's own clock. Retry a failed lock read before treating the lock as damaged.

---

## Finding 11. IT's managed.json is ignored if it starts with a byte-order mark (medium, proven)

**What goes wrong.** Windows PowerShell 5.1 (`Set-Content` or `Out-File -Encoding UTF8`), the default on school Windows images, writes an invisible marker (a byte-order mark) at the start of the file. `JSON.parse` rejects it, so every managed setting is ignored, including `autoUpdate: false` and the PIN requirement.

**Where.** `src/main/managed.ts:30` and `:51`.

**Evidence.** `parseManaged('﻿{"autoUpdate":false}')` returns "not valid JSON".

**Likelihood.** Medium wherever IT uses managed settings.

**Suggested fix.** Small. Strip a leading byte-order mark before parsing. The same fix belongs in preferences.json reading.

---

## Smaller findings

These are real but less likely or less harmful. Details are in `startup-findings-detail.md` or traced above.

| # | What goes wrong | Where | Size |
|---|---|---|---|
| 12 | A hung network share keeps a save running for ever, which stops the app quitting; a force-quit then loses changes and leaves the lock | `session.ts:574`, `index.ts:155-165` | Small: cap the wait at about 20 seconds, then back up locally and quit |
| 13 | An older copy can edit a file that a newer copy has already migrated, through takeover, keep-theirs or merge | `session.ts:830-835`, `:945-947` | Small: go read-only when the loaded file is newer |
| 14 | A failed takeover leaves a lock that this computer treats as its own but does not refresh; others are blocked for 10 minutes | `session.ts:942`, `:1066-1078` | Small |
| 15 | One unexpected field in preferences.json (for example a newer `version`) resets all preferences, including recent files | `prefs/preferences.ts:18`, `:53-54` | Small |
| 16 | Preference writes are not queued, so two at once can finish in the wrong order | `prefs/preferences.ts:65-75` | Small |
| 17 | A file double-clicked while the app is starting is silently not opened | `index.ts:49-56`, `fileService.ts:147` | Small |
| 18 | Mac: closing the recovery window leaves the app running with nothing to click | `index.ts:124-127`, `:138` | Small |
| 19 | Mac self-install: if the computer shuts down in the instant between the script's two renames, the app is missing from Applications (only hidden `.Locker Manager.app.previous` remains) | `macInstallScript.ts:19-24` | Small: on start, nothing to do; document the recovery in the IT guide. Very low likelihood |
| 20 | Mac self-install: each ad-hoc build has a different signature, so macOS may ask again after every self-update for access to Documents, network volumes or OneDrive. A "Don't Allow" makes the school file unreadable on that Mac. Unproven | `macInstaller.ts` | Check on a real Mac before 1.0 |
| 21 | Once signing is switched on, a release built without the signing secrets (expired or removed) is still published, and every signed copy will refuse it (Windows checks the publisher name; Squirrel.Mac checks the signature) until the next signed release | `release.yml` build steps | Small: fail the release when a signed release follows an unsigned build, once signing exists |
| 22 | An authenticating school proxy (SPEC.md 9.4) has never been tested; the update check would fail quietly, so those schools would never update | `updater.ts` | Test once on a proxy that asks for a password |

## Checked and sound

- **The 0.11.4 fix holds.** Every delete in the main process goes through `removeTree` (`original-fs`); nothing else walks into `pending-update`'s `.asar`. A leftover download that will not delete no longer stops an update.
- **Damaged update-result.json** returns nothing and never stops start-up. A failed Mac install is remembered per version, and a newer version is still tried.
- **Mac install script**: every value is quoted, the old app is put back on any failure, and leftovers from an interrupted run are cleared on the next run.
- **Atomic save**: temporary file in the same folder, flushed, read back and hash-checked, hash re-checked before the rename, original untouched on any failure. Renames retry 10 times on EPERM, EBUSY and EACCES, and later saves are not stuck after a failure.
- **Changes during a save** are never marked saved. A failed save is never shown as saved.
- **Conflicts**: keep mine, keep theirs and merge each keep the other version as a backup first.
- **Placeholder and part-synced files** are caught on open.
- **Migration on open**: a named backup first, the migration in memory, the original untouched and the lock released on failure.
- **sql.js export failure** becomes "save failed" with a retry; settings are re-applied after each export.
- **Damaged, empty or wrong-shaped preferences.json** and a missing or damaged managed.json load safely.
- **sql.js's WASM file** is inside the installed 0.11.1 package and loads from there; every package the main process needs is in the package.
- **The preload** loads only `electron`, so it works in the sandbox.
- **Shell commands** use argument lists, so paths with spaces or accents are safe.
- **Version comparison** uses three parts, so Windows's four-part versions do not confuse it.
- **Proxy and network failures** become quiet update errors, not crashes.
- **Long Windows paths**: Node adds the long-path prefix itself. SharePoint's own 400-character limit was not tested.

## Fixes recommended before 1.0

In this order:

1. **Finding 1, Undo's broken links** (medium). Must land before any release that adds a migration, including the repair for files already affected.
2. **Finding 3, start-up errors** (small), with the recovery-page counter (F2) and the blank-window guard (F3).
3. **Finding 2, the Windows install loop** (medium), with the managed.json byte-order mark fix (finding 11, small).
4. **Finding 4, release checks** (large in total). At least: "it starts" must mean the app is usable and opens the demo school (small), a way to withdraw a release (small), and an onward-update proof before publishing (medium to large).
5. **Finding 6, lost changes at quit and update** (small).
6. **Finding 7, Windows shutdown** (small).
7. **Finding 9, the backup flood** (small).
8. **Finding 5, opening a backup when a file will not open** (medium). This is the safety net for every other data fault.

Findings 8 and 10 (OneDrive editing and lock clocks) matter most for laptop schools on OneDrive, and could follow soon after 1.0. Item 20 (macOS asking again for folder access after each update) should be checked by hand on a real Mac along with the other 1.0 hand checks.
