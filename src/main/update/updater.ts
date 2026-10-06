import { app, BrowserWindow, shell } from 'electron'
import log from 'electron-log/main'
import { autoUpdater, type UpdateInfo } from 'electron-updater'
import { brand } from '@shared/brand'
import { channels, type InstallResult, type UpdateMode, type UpdateStatus } from '@shared/ipc'
import { getBusyState } from '../busy'
import {
  allowPrerelease,
  CHECK_DELAY_MS,
  CHECK_INTERVAL_MS,
  installBlockedReason,
  releasePageUrl
} from './policy'

let mode: UpdateMode = 'disabled'
let status: UpdateStatus = { state: 'idle', mode }
let manualCheck = false
let timer: NodeJS.Timeout | undefined

function releaseNotesText(info: UpdateInfo): string | undefined {
  const notes = info.releaseNotes
  if (typeof notes === 'string') return notes
  if (Array.isArray(notes)) return notes.map((n) => n.note ?? '').join('\n\n')
  return undefined
}

function setStatus(next: UpdateStatus): void {
  status = next
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channels.updateStatus, status)
  }
}

export function getUpdateStatus(): UpdateStatus {
  return status
}

export function getUpdateMode(): UpdateMode {
  return mode
}

export function setupUpdater(initialMode: UpdateMode): void {
  mode = initialMode
  status = { state: 'idle', mode }
  if (mode === 'disabled') {
    log.info('updater disabled (development build)')
    return
  }

  autoUpdater.logger = log
  autoUpdater.allowPrerelease = allowPrerelease(app.getVersion())
  autoUpdater.allowDowngrade = false
  // On an unsigned Mac we only notify; the install would be rejected.
  autoUpdater.autoDownload = mode === 'auto'
  autoUpdater.autoInstallOnAppQuit = mode === 'auto'
  autoUpdater.fullChangelog = false

  autoUpdater.on('checking-for-update', () => {
    setStatus({ state: 'checking', mode, manual: manualCheck })
  })
  autoUpdater.on('update-not-available', (info) => {
    setStatus({
      state: 'up-to-date',
      mode,
      version: info.version,
      checkedAt: new Date().toISOString()
    })
  })
  autoUpdater.on('update-available', (info) => {
    const base = {
      mode,
      version: info.version,
      downloadPageUrl: releasePageUrl(brand.repoUrl, info.version)
    }
    const notes = releaseNotesText(info)
    setStatus({
      state: 'available',
      ...base,
      ...(notes !== undefined ? { releaseNotes: notes } : {}),
      ...(info.releaseDate ? { releaseDate: info.releaseDate } : {})
    })
  })
  autoUpdater.on('download-progress', (p) => {
    const version =
      status.state === 'available' || status.state === 'downloading' ? status.version : 'unknown'
    setStatus({ state: 'downloading', mode, version, percent: Math.round(p.percent) })
  })
  autoUpdater.on('update-downloaded', (info) => {
    const notes = releaseNotesText(info)
    setStatus({
      state: 'ready',
      mode,
      version: info.version,
      ...(notes !== undefined ? { releaseNotes: notes } : {})
    })
  })
  autoUpdater.on('error', (error) => {
    // Quiet unless the operator asked (SPEC.md 9.4): school proxies fail often.
    log.warn('update check failed', error.message)
    setStatus({ state: 'error', mode, message: error.message, manual: manualCheck })
    manualCheck = false
  })

  timer = setTimeout(() => {
    void checkForUpdates(false)
    setInterval(() => void checkForUpdates(false), CHECK_INTERVAL_MS)
  }, CHECK_DELAY_MS)
  app.on('before-quit', () => {
    if (timer) clearTimeout(timer)
  })
}

export async function checkForUpdates(manual: boolean): Promise<void> {
  if (mode === 'disabled') {
    setStatus({
      state: 'error',
      mode,
      message: 'Updates are not available in a development build.',
      manual
    })
    return
  }
  manualCheck = manual
  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    log.warn('checkForUpdates threw', error)
  } finally {
    manualCheck = false
  }
}

/**
 * Installs a downloaded update. Never while a save, print or import is running;
 * unsaved changes are saved and the data file closed (releasing the edit lock)
 * before the app quits (SPEC.md 9.3).
 */
export async function installUpdateNow(beforeInstall: () => Promise<void>): Promise<InstallResult> {
  if (status.state !== 'ready') {
    return { started: false, reason: 'No update has been downloaded yet.' }
  }
  const blocked = installBlockedReason({ ...getBusyState(), unsavedChanges: false })
  if (blocked) return { started: false, reason: blocked }
  await beforeInstall()
  if (getBusyState().unsavedChanges) {
    return {
      started: false,
      reason: 'Your changes could not be saved, so the update has not started.'
    }
  }
  setImmediate(() => autoUpdater.quitAndInstall(true, true))
  return { started: true }
}

export async function openDownloadPage(): Promise<void> {
  const url = status.state === 'available' ? status.downloadPageUrl : brand.releasesUrl
  await shell.openExternal(url)
}
