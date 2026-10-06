import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { z } from 'zod'
import { channels } from '@shared/channels'
import { ComputerSettingsSchema, type ComputerSettings, type ComputerView } from '@shared/computer'
import { preferences } from './fileService'
import { managedPath, readManaged } from './managed'
import { applyUpdatePrefs, type UpdatePrefs } from './update/updater'

// This computer's settings (appearance and updates), with school IT's managed
// settings on top (SPEC.md 7, 9.5). Applied to every window and to the updater.

const PatchSchema = z
  .object({
    theme: ComputerSettingsSchema.shape.theme.removeDefault(),
    textSize: ComputerSettingsSchema.shape.textSize.removeDefault(),
    contrast: ComputerSettingsSchema.shape.contrast.removeDefault(),
    autoUpdate: ComputerSettingsSchema.shape.autoUpdate.removeDefault(),
    channel: ComputerSettingsSchema.shape.channel.removeDefault()
  })
  .partial()

export function computerView(): ComputerView {
  const { managed, problem } = readManaged()
  const own = preferences().get().computer
  const settings: ComputerSettings = {
    ...own,
    ...(managed.autoUpdate !== undefined ? { autoUpdate: managed.autoUpdate } : {}),
    ...(managed.updateChannel !== undefined ? { channel: managed.updateChannel } : {})
  }
  return { settings, managed, managedPath: managedPath(), managedProblem: problem }
}

export function updatePrefs(): UpdatePrefs {
  const v = computerView()
  return {
    autoInstall: v.settings.autoUpdate,
    channel: v.settings.channel,
    // IT turning updates off stops the automatic checks too; a manual check still works.
    autoCheck: v.managed.autoUpdate !== false
  }
}

export function applyToWindow(win: BrowserWindow): void {
  const s = computerView().settings
  win.webContents.setZoomFactor(s.textSize / 100)
}

function applyEverywhere(): void {
  const v = computerView()
  nativeTheme.themeSource = v.settings.theme
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    applyToWindow(win)
    win.webContents.send(channels.computerChanged, v)
  }
  applyUpdatePrefs(updatePrefs())
}

export function initComputer(): void {
  nativeTheme.themeSource = computerView().settings.theme
  app.on('browser-window-created', (_e, win) => {
    win.webContents.on('did-finish-load', () => applyToWindow(win))
  })
}

export function registerComputerHandlers(): void {
  ipcMain.handle(channels.computerGet, () => computerView())
  ipcMain.handle(channels.computerSet, async (_e, raw: unknown) => {
    const patch = PatchSchema.parse(raw)
    const managed = readManaged().managed
    // Managed keys stay as IT set them.
    if (managed.autoUpdate !== undefined) delete patch.autoUpdate
    if (managed.updateChannel !== undefined) delete patch.channel
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined)
    ) as Partial<ComputerSettings>
    await preferences().update((p) => ({ ...p, computer: { ...p.computer, ...clean } }))
    applyEverywhere()
    return computerView()
  })
}
