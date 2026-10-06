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

/** What the platform allows. */
let platformMode: UpdateMode = 'disabled'
/** What this computer does (and reports): notify only when automatic installs are off. */
let mode: UpdateMode = 'disabled'
let status: UpdateStatus = { state: 'idle', mode }
let manualCheck = false
let timer: NodeJS.Timeout | undefined
let interval: NodeJS.Timeout | undefined

export interface UpdatePrefs {
  /** Download and install by itself (where the platform allows). */
  autoInstall: boolean
  channel: 'stable' | 'beta'
  /** Check on start and every 4 hours; off when school IT turns updates off. */
  autoCheck: boolean
}

/** Applies this computer's update settings (SPEC.md 7 item 14, 9.3 channels, 9.5). */
export function applyUpdatePrefs(next: UpdatePrefs): void {
  if (platformMode === 'disabled') return
  mode = platformMode === 'auto' && !next.autoInstall ? 'manual-download' : platformMode
  autoUpdater.allowPrerelease = next.channel === 'beta' || allowPrerelease(app.getVersion())
  const install = mode === 'auto'
  autoUpdater.autoDownload = install
  autoUpdater.autoInstallOnAppQuit = install
  if (!next.autoCheck) {
    if (timer) clearTimeout(timer)
    if (interval) clearInterval(interval)
    timer = interval = undefined
  } else if (!timer && !interval) {
    timer = setTimeout(() => {
      timer = undefined
      void checkForUpdates(false)
      interval = setInterval(() => void checkForUpdates(false), CHECK_INTERVAL_MS)
    }, CHECK_DELAY_MS)
  }
}

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

export function setupUpdater(initialMode: UpdateMode, initialPrefs: UpdatePrefs): void {
  platformMode = initialMode
  mode = initialMode
  status = { state: 'idle', mode }
  if (mode === 'disabled') {
    log.info('updater disabled (development build)')
    return
  }

  autoUpdater.logger = log
  autoUpdater.allowDowngrade = false
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

  // On an unsigned Mac, or when this computer says so, we only notify; see applyUpdatePrefs.
  applyUpdatePrefs(initialPrefs)
  app.on('before-quit', () => {
    if (timer) clearTimeout(timer)
    if (interval) clearInterval(interval)
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
