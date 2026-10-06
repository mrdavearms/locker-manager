import { app, BrowserWindow } from 'electron'
import log from 'electron-log/main'
import { brand } from '@shared/brand'
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
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  if (app.isPackaged) {
    app.setAsDefaultProtocolClient(brand.protocol)
  }

  // macOS passes files and lockermanager:// links through these events. M1 will
  // open the file; for now the event is only logged (never the path contents).
  app.on('open-file', (event) => {
    event.preventDefault()
    log.info('open-file received (not handled before M1)')
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
    registerIpcHandlers(signed)
    setupUpdater(mode)
    buildMenu()
    createMainWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
