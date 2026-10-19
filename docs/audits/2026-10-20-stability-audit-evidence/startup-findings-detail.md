# Start-up and Electron-trap audit: Locker Manager (worktree stability-audit-eacf01, v0.11.4 source)

Scope: start-up path (index.ts, preferences, managed, recovery, window, computerService, sql.js in asar,
error handling, renderer crash, single instance, update-result.json) and Electron-only traps.
Proof scripts: scratchpad/startup/rec/main.js, rej/main.js, bq/main.js (run with the repo's Electron 44.5.1);
prefs-result.json (vitest scratch test, since deleted; git status clean).

## Findings

### F1. Any error during start-up leaves an invisible app that blocks every later launch
- What goes wrong: the whole start-up runs inside `void app.whenReady().then(async () => {...})` with no catch,
  and there is no `process.on('uncaughtException' | 'unhandledRejection')` and no `log.errorHandler.startCatching()`.
  If any awaited step throws before `createMainWindow()`, the promise rejects, Electron prints a console warning only
  (invisible in an installed copy, and nothing reaches main.log), the process keeps running with no window and
  KEEPS the single-instance lock. Every later double-click on the icon starts a second copy that finds the lock,
  and quits silently (`second-instance` finds no window to focus). On a Mac the Dock click does nothing because the
  `activate` handler is registered only after the window is made. The school sees "the app won't open" until they
  kill it in Task Manager / Activity Monitor or restart the computer.
- Where: src/main/index.ts:78-141 (no catch); triggers include src/main/recovery.ts:19 (prefs write on every start),
  src/main/prefs/preferences.ts:65-75 (update throws on any write failure), src/main/prefs/preferences.ts:109
  (`userInfo()` throws synchronously, escaping the `.catch()` at src/main/fileService.ts:97), and any future throw in
  initFileService / register* / setupUpdater / buildMenu.
- Likelihood: medium. preferences.json is written (temp file + rename) on every start. On Windows a rename onto a
  file that antivirus or the indexer has open fails with EPERM/EBUSY (graceful-fs retries this for exactly that
  reason; fsPort.ts:41 does not); disk full, a read-only preferences.json, or AppData redirected to an offline
  network share (common in schools) all throw too.
- Severity: high (app cannot be used; no message; no log line for IT).
- Evidence: Electron 44.5.1 test (rej/main.js): a throw inside the whenReady chain gives
  "UnhandledPromiseRejectionWarning", then "STILL ALIVE after 3s; windows= 0 lock= true".
  Vitest scratch: `Preferences.update` on a read-only folder throws EACCES; with preferences.json being a folder it
  throws EISDIR. electron-log only catches errors when `errorHandler.startCatching()` is called (grep: never called).
- Proven: yes for the mechanism and the prefs-write failure; the Windows EPERM trigger is unproven here (no Windows).
- Fix (small): wrap the start-up body in try/catch: log, `dialog.showErrorBox` with the log path, then show the
  recovery page or `app.exit(1)` so the lock is released. Make `noteStartAttempt` failure non-fatal (catch and carry
  on). Call `log.errorHandler.startCatching()` (or add process handlers that log). Retry rename on Windows
  EPERM/EACCES/EBUSY a few times.

### F2. The recovery screen cannot see the failures it is meant to catch
- What goes wrong: (a) `noteStartAttempt` runs late (index.ts:124), after initFileService, every register call,
  setupUpdater and buildMenu, so a main-process failure in any of those is never counted (and, per F1, strands the app).
  (b) The counter is reset on the main window's `did-finish-load` (index.ts:130-131), which fires as soon as
  index.html loads, even if the React app then throws and the window is blank. So a version whose window is blank
  or broken never reaches the recovery screen. In practice it only shows if the process dies in the short gap between
  creating the window and the HTML finishing loading.
- Where: src/main/index.ts:124-131, src/main/recovery.ts:14-30.
- Likelihood: medium (the class of failure recovery exists for is exactly a broken new release).
- Severity: medium (the safety net promised in SPEC.md 9.3 does not work for the likely failures).
- Evidence: code trace; there are no tests of recovery at all (grep tests for recovery/failedStarts: none), and it is
  switched off for unpackaged runs, so e2e never exercises it.
- Proven: by trace.
- Fix (small to medium): call noteStartAttempt first after `whenReady` (inside try/catch); reset the counter only when
  the renderer reports it has mounted (an IPC "app ready" sent from the root component after first render), not on
  did-finish-load.

### F3. A renderer error or crash leaves a blank window with no way back except quitting
- What goes wrong: there is no React error boundary anywhere in src/renderer (grep: no ErrorBoundary,
  componentDidCatch, getDerivedStateFromError, window 'error' listener). Any exception while rendering any screen
  unmounts the whole app: an empty window. There is no `render-process-gone` / `unresponsive` handler in the main
  process, and the packaged View menu has no Reload (menu.ts adds reload only when not packaged). If the renderer
  dies before first paint, `ready-to-show` never fires and the window stays hidden (window.ts:61,77), which looks like
  F1. Data is safe (the main process holds the file and saves on quit).
- Where: src/renderer (no boundary), src/main/window.ts:52-93 (no crash handlers), src/main/menu.ts View submenu.
- Likelihood: medium (one unexpected null in any screen is enough; renderer out-of-memory on a big import is possible).
- Severity: medium (stranded until restart; no data loss).
- Proven: by grep and trace.
- Fix (small): a top-level error boundary showing "Something went wrong" with a Reload button and the log path;
  `webContents.on('render-process-gone')` that reloads once and otherwise shows a message; show the window after a
  timeout even without ready-to-show.

### F4. Windows: a start-up update that cannot install makes the app quit a few seconds after every launch (unproven)
- What goes wrong: an update found by the check 3 s after launch, before any file is open, installs at once
  (updater.ts:266-284 calls installUpdateNow straight from onReady). On Windows the download is cached after the
  first time, so update-downloaded follows the check within a second or two, leaving almost no time for Skip.
  `quitAndInstall(true, true)` runs the NSIS installer silently and quits. If the installer cannot finish, the app
  has already gone and is not restarted. The next launch repeats the same thing. The Mac path remembers a failed
  version (`macFailed`, updater.ts:140,169); Windows has no equivalent.
  Realistic trigger: IT installs per-machine (`/S /allusers`, which SPEC.md 9.5 offers) and a standard user runs it:
  the NSIS installer needs elevation and the user cannot pass UAC. Antivirus blocking the installer is another.
- Where: src/main/update/updater.ts:266-285, 312-336.
- Likelihood: medium in IT-managed schools that do per-machine installs without managed.json autoUpdate:false (see F5).
- Severity: high (app unusable on that computer until IT intervenes).
- Proven: no (needs a Windows PC). The code path is certain; the installer behaviour under a standard user is the
  unproven part.
- Fix (medium): before quitAndInstall at start-up, write "startupInstallTried: <version>" to preferences; on the next
  start, if the running version is still older and the same version is offered, do not auto-install at start-up
  (show the banner instead). Optionally skip auto-install when the install folder is not writable by this user.

### F5. managed.json saved with a UTF-8 byte-order mark is ignored
- What goes wrong: `JSON.parse` rejects a leading BOM, so the whole managed file is ignored ("managed.json is not
  valid JSON"). Windows PowerShell 5.1 `Set-Content -Encoding UTF8` / `Out-File -Encoding utf8`, which IT deployment
  scripts commonly use, write a BOM, as did older Notepad. IT's autoUpdate:false, update channel, PIN rule and
  default data file then silently do not apply (only visible in Settings, This computer). preferences.json does not
  have this problem (TextDecoder strips the BOM).
- Where: src/main/managed.ts:51 (readFileSync 'utf8') and :30 (JSON.parse).
- Likelihood: medium for Windows IT using PowerShell.
- Severity: medium (IT policy not applied; feeds F4).
- Evidence: `parseManaged('﻿{"autoUpdate":false}').problem` = "managed.json is not valid JSON, so it was ignored."
- Proven: yes.
- Fix (small): strip a leading ﻿ before parsing.

### F6. One bad field in preferences.json throws away every preference
- What goes wrong: `PrefsSchema.safeParse` on the whole object; any single invalid field resets everything to
  defaults: operator name, recent files, tour seen, dismissed sync copies, appearance. `version: z.literal(1)` means
  any future version 2 file, read by an older copy (for example after the recovery screen's "install the previous
  version"), loses everything. Not a crash.
- Where: src/main/prefs/preferences.ts:18, 53-54.
- Likelihood: low now, higher after the first preferences format change.
- Severity: low.
- Evidence: scratch test: `{"version":2,"operatorName":"Ann"}` and `{"failedStarts":-3,"operatorName":"Ann"}` both
  load with operatorName null.
- Proven: yes.
- Fix (small): per-field `.catch(default)` in the schema; accept any version number.

### F7. Preference writes are not serialised
- What goes wrong: each `update()` writes its own temp file and renames it, with no queue. Two overlapping updates
  can finish their renames in the wrong order, leaving the older state on disk (in memory it is right, so it shows
  only after a restart). On Windows two renames onto the same file at once can fail with EPERM, which at start-up
  feeds F1.
- Where: src/main/prefs/preferences.ts:65-75; src/main/file/fsPort.ts:41 (no rename retry).
- Likelihood: low. Severity: low (lost preference, or F1 at start-up).
- Proven: by trace.
- Fix (small): chain updates on a promise queue; retry rename on Windows transient errors.

### F8. Events that arrive before start-up finishes, or after it failed, throw
- What goes wrong: `second-instance` is not gated on `ready`: a .lockers file double-clicked while the first copy is
  still starting calls `openFromOs` while `session` is still undefined (fileService.ts:147): TypeError, unhandled,
  the file silently does not open. If initFileService failed (F1), `before-quit` (index.ts:156) and
  `window-all-closed` (index.ts:146) throw TypeError; Electron shows its "JavaScript error in the main process"
  dialog at quit (quit still proceeds; tested in bq/main.js).
- Likelihood: low. Severity: low.
- Proven: quit behaviour yes; second-instance by trace.
- Fix (small): in second-instance, push to pendingFiles/pendingLinks when not ready; guard fileSession() uses.

### F9. Mac: after the recovery screen is closed the app keeps running with nothing to click
- What goes wrong: in recovery mode the code returns before `app.on('activate')` is registered (index.ts:124-127,138).
  Closing the recovery window on a Mac leaves the app running with no window and the Dock icon does nothing until
  the person chooses Quit.
- Likelihood: low. Severity: low.
- Fix (small): quit when the recovery window closes.

### F10. sql.js load failure is cached forever and reported as "not a data file"
- What goes wrong: `sqlJs ??= initSqlJs()` keeps a rejected promise, so one failure to start the WebAssembly engine
  (for example memory pressure) makes every later open fail until the app restarts. Every error from `fromBytes` is
  shown as `not_a_data_file`, so staff are told their school's file is not a Locker Manager file and may restore a
  backup they did not need.
- Where: src/main/db/db.ts:6-9; src/main/file/session.ts:294-297.
- Likelihood: low. Severity: medium (misleading; could prompt an unnecessary restore).
- Proven: by trace.
- Fix (small): clear `sqlJs` on rejection; report engine failure separately from a bad file.

### F11. GPU failure on remote-desktop / virtual machines has no fallback (unproven)
- What goes wrong: Chromium in Electron exits the whole app ("GPU process isn't usable") when the GPU process keeps
  failing, which happens on some RDP/Citrix/VDI sessions and old drivers. The recovery page needs the GPU too.
  There is no switch to `app.disableHardwareAcceleration()` after GPU crashes.
- Likelihood: low (higher in schools using virtual desktops). Severity: high on the computers affected.
- Proven: no.
- Fix (medium): listen for `child-process-gone` with type GPU, set a preference, and disable hardware acceleration
  before `ready` on the next start; also honour a managed.json key.

## Checked and sound
- preferences.json missing, zero bytes, garbage, `null`, `[]`, or with a BOM: loads defaults (or the data), never throws (proven).
- managed.json missing or unreadable: ignored, no problem shown; invalid JSON or wrong shape: ignored with a message (proven).
- update-result.json corrupt, empty, `null`, or wrong shape: readLastMacResult returns null inside its try (traced).
- sql.js WASM is inside the packaged asar (proven on installed 0.11.1); initSqlJs with no options reads it through Electron's asar-aware fs; sql.js is in dependencies.
- Every non-builtin module the packaged main bundle requires is present in the asar (proven against installed 0.11.1).
- Packaged preload requires only `electron` (sandbox-safe; proven).
- Recovery page links (`lmrecovery:retry`, GitHub) reach setWindowOpenHandler with javascript:false and sandbox:true (proven in Electron 44.5.1).
- Recovery threshold: shows on the third start after two failures of the same version; reset by a version change and by "Try again".
- All deletes in src/main go through original-fs removeTree; no other main-process fs call walks into pending-update's .asar (readdir of the unpacked folder lists only the top level).
- No shell strings: every execFile/spawn passes an argument array; install.sh quotes every variable; paths with spaces or accents are safe.
- Fonts come from process.resourcesPath/fonts (extraResources, outside the asar); development uses getAppPath.
- `__dirname` in the CommonJS main bundle resolves preload and renderer inside the asar correctly.
- No app.getPath before ready; app.setName before ready equals productName, so userData does not move.
- Single-instance lock, second-instance focus, and open-file/open-url queuing until ready are correct.
- shell.openExternal only for https URLs in the app's own GitHub repo; menu uses a constant URL; openPath only on app-built paths.
- nativeTheme.themeSource only receives schema-checked values.
- app.getVersion() is the three-part package.json version, so lastStartedVersion is stable on Windows.
- net.fetch and electron-updater use Chromium's network stack (system proxy); failures become quiet update errors, not crashes.
- Signature checks and bundleWritable resolve false on any failure, never throw.
