import { join } from 'node:path'
import { app, BrowserWindow, session, shell } from 'electron'
import { brand } from '@shared/brand'

const isDev = !!process.env['ELECTRON_RENDERER_URL']

// The end-to-end tests start the app dozens of times. With this set, the window
// opens without taking focus from whoever is using the computer, and on a Mac
// the app stays out of the Dock and never comes to the front.
const background = process.env['LOCKER_MANAGER_BACKGROUND'] === '1'

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
  if (background && process.platform === 'darwin') app.setActivationPolicy('accessory')
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
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  })

  win.once('ready-to-show', () => (background ? win.showInactive() : win.show()))

  // Links open in the operator's browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(brand.repoUrl)) void shell.openExternal(url)
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
