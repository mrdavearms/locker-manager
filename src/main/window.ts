import { join } from 'node:path'
import { app, BrowserWindow, dialog, session, shell } from 'electron'
import log from 'electron-log/main'
import { brand } from '@shared/brand'
import { isAllowedExternalUrl } from '@shared/externalUrls'
import { watchForHang } from './hangWatch'

const isDev = !!process.env['ELECTRON_RENDERER_URL']

// The end-to-end tests start the app dozens of times. With this set, the window
// opens without taking focus from whoever is using the computer, and on a Mac
// the app stays out of the Dock and never comes to the front. Only an unpackaged
// app (how the tests launch it) honours it; an installed copy always shows normally.
const background = (): boolean =>
  !app.isPackaged && process.env['LOCKER_MANAGER_BACKGROUND'] === '1'

/**
 * Content Security Policy for the renderer. Inline styles are allowed because
 * Radix and Tailwind set style attributes; scripts are never inline. In
 * development the Vite server and its websocket are added.
 */
export function contentSecurityPolicy(dev: boolean): string {
  const devOrigins = dev ? ' http://localhost:* ws://localhost:*' : ''
  return [
    "default-src 'self'",
    `script-src 'self'${devOrigins}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${devOrigins}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'"
  ].join('; ')
}

export function installContentSecurityPolicy(): void {
  // The window never needs the camera, location, notifications or the like.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false)
  )
  session.defaultSession.setPermissionCheckHandler(() => false)
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [contentSecurityPolicy(isDev)]
      }
    })
  })
}

export function createMainWindow(): BrowserWindow {
  const quiet = background()
  if (quiet && process.platform === 'darwin') app.setActivationPolicy('accessory')
  const win = new BrowserWindow({
    title: brand.name,
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: false,
    backgroundColor: '#f6f7f9',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      // On Windows the spell checker fetches dictionaries from Google; the app
      // promises to contact nothing but GitHub.
      spellcheck: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  })

  const show = (): void => {
    if (win.isDestroyed() || win.isVisible()) return
    if (quiet) win.showInactive()
    else win.show()
  }
  win.once('ready-to-show', show)
  // A window whose code never draws must still appear, so the person sees something.
  const fallback = setTimeout(show, 15_000)
  win.on('closed', () => clearTimeout(fallback))

  // The window's code crashed or was stopped: reload it. The school's file lives in
  // the main process, so nothing is lost. A window that keeps crashing is not
  // reloaded for ever (docs/audits/2026-10-20-stability-audit.md, start-up F3).
  const crashes: number[] = []
  win.webContents.on('render-process-gone', (_event, details) => {
    log.error('window process stopped', details.reason, details.exitCode)
    if (details.reason === 'clean-exit' || win.isDestroyed()) return
    const now = Date.now()
    crashes.push(now)
    while (crashes.length > 0 && (crashes[0] ?? now) < now - 60_000) crashes.shift()
    show()
    if (crashes.length <= 3) {
      win.webContents.reload()
      return
    }
    dialog.showErrorBox(
      `${brand.name} keeps stopping`,
      'The window stopped several times in a minute. Your school’s file is safe. Close Locker Manager and open it again; if it keeps happening, tell your IT team.'
    )
  })

  // The window's code stopped answering (stuck, not crashed): offer to reload it.
  watchForHang(win, {
    ask: async (signal) => {
      const { response } = await dialog.showMessageBox(win, {
        type: 'warning',
        title: `${brand.name} is not responding`,
        message: 'The window has stopped responding.',
        detail:
          'Your school’s file is safe. You can wait, or reload the window. Anything typed on this screen but not yet saved will be lost if you reload.',
        buttons: ['Wait', 'Reload the window'],
        defaultId: 0,
        cancelId: 0,
        signal
      })
      return response === 1 ? 'reload' : 'wait'
    },
    reload: () => {
      if (!win.isDestroyed()) win.webContents.forcefullyCrashRenderer()
    },
    log: (message) => log.warn(message)
  })

  // Links open in the operator's browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event) => event.preventDefault())

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    void win.loadURL(rendererUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}
