import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, powerMonitor } from 'electron'
import log from 'electron-log/main'
import { brand } from '@shared/brand'
import {
  closeWarningShown,
  fileServiceReady,
  fileSession,
  initFileService,
  openFromOs,
  preferences,
  preferencesIfLoaded,
  readyToClose,
  registerFileHandlers,
  saveAndCloseForUpdate
} from './fileService'
import { GPU_OFF_MARKER, noteStartAttempt, noteStarted, showRecovery } from './recovery'
import { openLockerLink } from './links'
import { registerIpcHandlers } from './ipc/handlers'
import { handlers as rpcHandlers } from './rpc/handlers'
import { registerRenderHandlers } from './renderService'
import { registerDocumentHandlers } from './documentService'
import { setFontDir } from './render/fonts'
import { sweepRenderTemp } from './render/pdf'
import { registerRpc } from './rpc/registry'
import { buildMenu } from './menu'
import { runSelfTest, SELF_TEST_FLAG } from './selfTest'
import { shutdownNoteMessage, takeShutdownNote, writeShutdownNote } from './shutdownNote'
import { detectDeveloperIdSignature, detectWindowsSignature } from './signing'
import { buildCommit } from './buildInfo'
import { initRegistration } from './registration/registration'
import { macBlocker, updateMode, windowsBlocker } from './update/policy'
import { failedWindowsAttempt, folderWritable, recordWindowsAttempt } from './update/windowsAttempt'
import {
  bundleWritable,
  readLastMacResult,
  runningBundle,
  type MacResult
} from './update/macInstaller'
import { setupUpdater, type UpdatePrefs } from './update/updater'
import { readManaged } from './managed'
import { channels } from '@shared/channels'
import type { UpdateMode } from '@shared/ipc'
import { initComputer, registerComputerHandlers, updatePrefs } from './computerService'
import { createMainWindow, installContentSecurityPolicy } from './window'

// A copy started with its own data folder (tests, update proofs) keeps its log there too,
// so it never writes to the log of the copy staff use.
if (process.argv.some((a) => a.startsWith('--user-data-dir='))) {
  app.setAppLogsPath(join(app.getPath('userData'), 'logs'))
  log.transports.file.resolvePathFn = () => join(app.getPath('userData'), 'logs', 'main.log')
}

// Logs go to the app data folder, rotated. Never log names or codes (SPEC.md 8.1).
log.initialize()
log.transports.file.maxSize = 2 * 1024 * 1024
log.transports.file.level = 'info'
log.transports.console.level = app.isPackaged ? false : 'debug'

app.setName(brand.name)

// Unhandled errors are logged instead of showing Electron's own error box over a
// working window (docs/audits/2026-10-20-stability-audit.md, finding 3).
log.errorHandler.startCatching({ showDialog: false })

// Some remote-desktop and virtual-desktop computers, and old graphics drivers, crash
// Chromium's graphics process. After it fails once, later starts draw without the
// graphics card. IT can also start the app with --disable-gpu (docs/it-guide.md).
const gpuOff = join(app.getPath('userData'), GPU_OFF_MARKER)
if (existsSync(gpuOff)) app.disableHardwareAcceleration()
app.on('child-process-gone', (_event, details) => {
  if (details.type !== 'GPU' || details.reason === 'clean-exit' || details.reason === 'killed')
    return
  log.warn(
    `graphics process stopped (${details.reason}); later starts will not use the graphics card`
  )
  try {
    mkdirSync(dirname(gpuOff), { recursive: true })
    writeFileSync(gpuOff, `${details.reason} ${new Date().toISOString()}\n`)
  } catch (error) {
    log.warn('could not record the graphics failure', String(error))
  }
})

if (process.argv.includes(SELF_TEST_FLAG)) {
  // The release checks run this on every build: no window, no file, no updater.
  void app
    .whenReady()
    .then(runSelfTest)
    .then(
      (code) => app.exit(code),
      (error: unknown) => {
        log.error('self-test could not run', error)
        app.exit(1)
      }
    )
} else if (!app.requestSingleInstanceLock()) {
  // One copy of the app per computer (SPEC.md 8.2).
  app.quit()
} else {
  // Files double-clicked before the app is ready wait here.
  const pendingFiles: string[] = process.argv.slice(1).filter((a) => /\.lockers$/i.test(a))
  const pendingLinks: string[] = process.argv
    .slice(1)
    .filter((a) => a.startsWith(`${brand.protocol}://`))
  let ready = false

  app.on('second-instance', (_event, argv) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
    // Until start-up has finished, files and links wait like those given at launch.
    const file = argv.slice(1).find((a) => /\.lockers$/i.test(a))
    if (file) {
      if (ready) void openFromOs(file)
      else pendingFiles.push(file)
    }
    const link = argv.slice(1).find((a) => a.startsWith(`${brand.protocol}://`))
    if (link) {
      if (ready) openLockerLink(link)
      else pendingLinks.push(link)
    }
  })

  if (app.isPackaged) {
    app.setAsDefaultProtocolClient(brand.protocol)
  }

  // macOS passes double-clicked files through this event, sometimes before ready.
  app.on('open-file', (event, path) => {
    event.preventDefault()
    if (ready) void openFromOs(path)
    else pendingFiles.push(path)
  })
  // A scanned label QR code (SPEC.md 5.6): lockermanager://locker/<id> opens that locker.
  app.on('open-url', (event, url) => {
    event.preventDefault()
    if (ready) openLockerLink(url)
    else pendingLinks.push(url)
  })

  // Everything before the first window is one step: an error anywhere in it used to
  // leave a copy running with no window, holding the single-instance lock, so every
  // later launch quit at once and the updater never started
  // (docs/audits/2026-10-20-stability-audit.md, finding 3).
  let mode: UpdateMode = 'disabled'
  let unsignedMac = false
  let blocker: string | null = null
  let updaterStarted = false

  function startUpdater(prefs: UpdatePrefs, closeFile: () => Promise<unknown>): void {
    if (updaterStarted) return
    updaterStarted = true
    setupUpdater(mode, prefs, {
      macSelfInstall: unsignedMac && blocker === null,
      manualReason: blocker ?? undefined,
      lastMacResult: lastMacResult,
      closeFile,
      failedWindowsVersion,
      recordInstall: (version) => recordWindowsAttempt(app.getPath('userData'), version, new Date())
    })
  }
  let lastMacResult: MacResult | null = null
  let failedWindowsVersion: string | null = null

  async function start(): Promise<void> {
    const signed = !app.isPackaged
      ? false
      : process.platform === 'darwin'
        ? await detectDeveloperIdSignature(process.execPath)
        : process.platform === 'win32'
          ? await detectWindowsSignature(process.execPath)
          : false
    // An unsigned Mac copy replaces its own app bundle when macOS allows it (update/macInstaller.ts).
    unsignedMac = app.isPackaged && process.platform === 'darwin' && !signed
    const bundle = unsignedMac ? runningBundle() : ''
    // A Windows copy IT installed for everyone cannot be changed by a standard account.
    const windowsCopy = app.isPackaged && process.platform === 'win32'
    const winBlock = windowsCopy
      ? windowsBlocker(await folderWritable(dirname(process.execPath)))
      : null
    blocker = unsignedMac ? macBlocker(bundle, await bundleWritable(bundle)) : winBlock
    mode = updateMode({
      platform: process.platform,
      packaged: app.isPackaged,
      signed,
      macBlocker: unsignedMac ? blocker : null,
      windowsBlocker: winBlock
    })
    failedWindowsVersion = windowsCopy
      ? failedWindowsAttempt(app.getPath('userData'), app.getVersion())
      : null
    lastMacResult = unsignedMac ? await readLastMacResult() : null
    log.info(
      `${brand.name} ${app.getVersion()} starting; build=${buildCommit} platform=${process.platform} signed=${signed} updates=${mode}` +
        (unsignedMac ? ` mac-self-install=${blocker === null ? 'yes' : 'no'}` : '') +
        (windowsCopy ? ` windows-self-install=${winBlock === null ? 'yes' : 'no'}` : '') +
        (failedWindowsVersion ? ` windows-install-failed=${failedWindowsVersion}` : '')
    )

    // For the end-to-end test of a failed start only; an installed copy ignores it.
    if (!app.isPackaged && process.env['LOCKER_MANAGER_FAIL_START'] === '1')
      throw new Error('a start-up test failure')
    await initFileService()
    initRegistration(preferences)
    // Counted first, so a start that fails anywhere after this is seen (SPEC.md 9.3).
    // Writing the count must never stop the app starting.
    const recover = await noteStartAttempt(preferences()).catch((error: unknown) => {
      log.warn('could not record the start attempt', String(error))
      return false
    })
    // The updater starts as early as it can, so even a copy that fails later can
    // install a fixed release.
    startUpdater(updatePrefs(), saveAndCloseForUpdate)

    // Fonts for labels and letters: beside the app when packaged, in the project in development.
    setFontDir(
      app.isPackaged
        ? join(process.resourcesPath, 'fonts')
        : join(app.getAppPath(), 'resources', 'fonts')
    )
    installContentSecurityPolicy()
    void sweepRenderTemp()
    registerIpcHandlers(signed)
    registerFileHandlers()
    registerRpc(fileSession, rpcHandlers)
    registerRenderHandlers()
    registerDocumentHandlers()
    initComputer()
    registerComputerHandlers()
    buildMenu()
    if (recover) {
      showRecovery(preferences())
      return
    }
    // The start counts as good once the window's code has drawn the app, not when
    // the page loads: a page whose code fails still finishes loading.
    ipcMain.once(channels.appMounted, () => {
      void noteStarted(preferences()).catch((error: unknown) =>
        log.warn('could not record the start', String(error))
      )
    })
    const win = createMainWindow()
    guardClose(win)
    ready = true
    // After sleep, saves wait for the sync service and a fresh look at the lock (finding 8).
    powerMonitor.on('resume', () => fileSession().afterWake())
    win.webContents.once('did-finish-load', () => {
      const note = takeShutdownNote(app.getPath('userData'))
      if (note) {
        void dialog.showMessageBox(win, {
          type: 'warning',
          title: brand.name,
          message: 'Your last changes were not saved before Windows shut down',
          detail: shutdownNoteMessage(note)
        })
      }
      const file = pendingFiles.pop()
      if (file) void openFromOs(file)
      const link = pendingLinks.pop()
      if (link) setTimeout(() => openLockerLink(link), 1500)
    })
  }

  /** Start-up failed: say so in a window, and keep the updater able to fix it. */
  function startFailed(error: unknown): void {
    log.error('start-up failed', error)
    const problem = error instanceof Error ? error.message : String(error)
    if (mode !== 'disabled') {
      try {
        // No preferences may be readable here; IT's managed settings still apply.
        startUpdater(
          {
            autoInstall: true,
            channel: 'stable',
            autoCheck: readManaged().managed.autoUpdate !== false
          },
          async () => undefined
        )
      } catch (e) {
        log.error('updater could not start either', e)
      }
    }
    try {
      showRecovery(preferencesIfLoaded(), problem)
    } catch (e) {
      log.error('recovery page failed', e)
      dialog.showErrorBox(
        `${brand.name} could not start`,
        `${problem}\n\nYour school's file has not been changed. Try again, or restart the computer. If it keeps happening, tell your IT team.`
      )
      app.exit(1)
    }
  }

  void app.whenReady().then(async () => {
    try {
      await start()
    } catch (error) {
      startFailed(error)
    }
  })

  app.on('activate', () => {
    if (ready && BrowserWindow.getAllWindows().length === 0) guardClose(createMainWindow())
  })

  // Closing the window with changes that cannot be saved asks first (finding 6).
  let quitting = false
  function guardClose(win: BrowserWindow): void {
    // Windows shutdown or log-off sends no quit events (finding 7): start saving when
    // Windows asks, and when it ends the session, save or back up without waiting.
    win.on('query-session-end', () => {
      if (fileServiceReady())
        void fileSession()
          .flush()
          .catch(() => undefined)
    })
    win.on('session-end', () => {
      if (!fileServiceReady()) return
      const r = fileSession().emergencyStop()
      log.warn(`windows session ending; unsaved=${r.unsaved}`)
      if (r.unsaved && r.path) {
        writeShutdownNote(app.getPath('userData'), {
          path: r.path,
          backup: r.backup,
          at: new Date().toISOString()
        })
      }
    })
    let allowed = false
    win.on('close', (event) => {
      if (allowed || quitting || !fileServiceReady() || !fileSession().hasUnsavedChanges) return
      event.preventDefault()
      void readyToClose(win).then((ok) => {
        if (!ok || win.isDestroyed()) return
        allowed = true
        win.close()
      })
    })
  }

  // Closing the window closes the file: saved, and the edit lock released, so a
  // Mac app left running without a window never blocks anyone else.
  app.on('window-all-closed', () => {
    if (!fileServiceReady()) {
      app.quit()
      return
    }
    void fileSession()
      .close()
      .catch((error: unknown) => log.error('close failed', error))
      .then(() => closeWarningShown())
      .finally(() => {
        if (process.platform !== 'darwin') app.quit()
      })
  })

  // Never quit with unsaved changes or a held lock (SPEC.md 6.2, 9.3). If the changes
  // cannot be saved the person chooses; any message about them is read before quitting.
  let closedForQuit = false
  let askingToQuit = false
  app.on('before-quit', (event) => {
    if (closedForQuit || !fileServiceReady() || !fileSession().isOpen) {
      quitting = true
      return
    }
    event.preventDefault()
    if (askingToQuit) return
    askingToQuit = true
    void readyToClose()
      .then(async (ok) => {
        if (!ok) return
        await fileSession()
          .close()
          .catch((error: unknown) => log.error('close on quit failed', error))
        await closeWarningShown()
        closedForQuit = true
        quitting = true
        app.quit()
      })
      .finally(() => {
        askingToQuit = false
      })
  })
}
