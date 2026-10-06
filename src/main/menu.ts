import { app, BrowserWindow, Menu, shell, type MenuItemConstructorOptions } from 'electron'
import { brand } from '@shared/brand'
import { channels } from '@shared/ipc'
import { checkForUpdates } from './update/updater'

function sendToFocused(channel: string): void {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  win?.webContents.send(channel)
}

export function buildMenu(): void {
  const isMac = process.platform === 'darwin'

  const helpItems: MenuItemConstructorOptions[] = [
    { label: 'Check for updates…', click: () => void checkForUpdates(true) },
    { label: 'Open the download page', click: () => void shell.openExternal(brand.releasesUrl) },
    { type: 'separator' },
    { label: `About ${brand.name}`, click: () => sendToFocused(channels.openAbout) }
  ]

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { label: `About ${brand.name}`, click: () => sendToFocused(channels.openAbout) },
              { label: 'Check for updates…', click: () => void checkForUpdates(true) },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ]
          } satisfies MenuItemConstructorOptions
        ]
      : []),
    { label: 'File', submenu: [isMac ? { role: 'close' } : { role: 'quit' }] },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        ...(app.isPackaged
          ? []
          : [{ role: 'reload' } as const, { role: 'toggleDevTools' } as const]),
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { label: 'Help', role: 'help', submenu: helpItems }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
