import { app, BrowserWindow } from 'electron'
import log from 'electron-log/main'
import { brand } from '@shared/brand'
import { fileSession, initFileService, openFromOs, registerFileHandlers } from './fileService'
import { registerIpcHandlers } from './ipc/handlers'
import { buildMenu } from './menu'
import { detectDeveloperIdSignature } from './signing'
import { updateMode } from './update/policy'
import { setupUpdater } from './update/updater'
import { createMainWindow, installContentSecurityPolicy } from './window'

// Logs go to the app data folder, rotated. Never log names or codes (SPEC.md 8.1).
log.initialize()
log.transports.file.maxSize = 2 * 1024 * 1024
log.transports.file.level = 'info'
log.transports.console.level = app.isPackaged ? false : 'debug'

app.setName(brand.name)

// One copy of the app per computer (SPEC.md 8.2).
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  // Files double-clicked before the app is ready wait here.
  const pendingFiles: string[] = process.argv.slice(1).filter((a) => /\.lockers$/i.test(a))
  let ready = false

  app.on('second-instance', (_event, argv) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
    const file = argv.slice(1).find((a) => /\.lockers$/i.test(a))
    if (file) void openFromOs(file)
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
  app.on('open-url', (event) => {
    event.preventDefault()
    log.info('open-url received (not handled before M1)')
  })

  void app.whenReady().then(async () => {
    const signed =
      app.isPackaged && process.platform === 'darwin'
        ? await detectDeveloperIdSignature(process.execPath)
        : false
    const mode = updateMode({ platform: process.platform, packaged: app.isPackaged, signed })
    log.info(
      `${brand.name} ${app.getVersion()} starting; platform=${process.platform} signed=${signed} updates=${mode}`
    )

    installContentSecurityPolicy()
    await initFileService()
    registerIpcHandlers(signed)
    registerFileHandlers()
    setupUpdater(mode)
    buildMenu()
    const win = createMainWindow()
    ready = true
    win.webContents.once('did-finish-load', () => {
      const file = pendingFiles.pop()
      if (file) void openFromOs(file)
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  // Closing the window closes the file: saved, and the edit lock released, so a
  // Mac app left running without a window never blocks anyone else.
  app.on('window-all-closed', () => {
    void fileSession()
      .close()
      .finally(() => {
        if (process.platform !== 'darwin') app.quit()
      })
  })

  // Never quit with unsaved changes or a held lock (SPEC.md 6.2, 9.3).
  let closedForQuit = false
  app.on('before-quit', (event) => {
    if (closedForQuit || !fileSession().isOpen) return
    event.preventDefault()
    void fileSession()
      .close()
      .catch((error: unknown) => log.error('close on quit failed', error))
      .finally(() => {
        closedForQuit = true
        app.quit()
      })
  })
}
