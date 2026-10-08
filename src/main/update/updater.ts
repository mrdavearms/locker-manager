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
  installAtStartup,
  installBlockedReason,
  macZipFile,
  releaseFileUrl,
  releasePageUrl
} from './policy'
import { installMacUpdate, prepareMacUpdate, type MacResult } from './macInstaller'

/** What the platform allows. */
let platformMode: UpdateMode = 'disabled'
/** What this computer does (and reports): notify only when automatic installs are off. */
let mode: UpdateMode = 'disabled'
let status: UpdateStatus = { state: 'idle', mode }
let manualCheck = false
let timer: NodeJS.Timeout | undefined
let interval: NodeJS.Timeout | undefined

/** Unsigned Mac that replaces its own app bundle (macInstaller.ts) instead of using Squirrel.Mac. */
let macSelfInstall = false
/** Why this copy only offers the download page, for the banner. */
let manualReason: string | undefined
let macStaged: { version: string; app: string } | null = null
let macDownloading: string | null = null
/** A version whose install failed on this Mac; it is offered as a download instead. */
let macFailed: MacResult | null = null
let installing = false

// An update found by the check at launch installs straight away, before work starts.
let startup = true
let fileOpenedSinceLaunch = false
let skipped = false
let closeFile: () => Promise<void> = async () => undefined

function atStartup(): boolean {
  return installAtStartup({ startup, fileOpenedSinceLaunch, skipped })
}

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
  // On an unsigned Mac, Squirrel.Mac would refuse the download; macInstaller.ts does it.
  autoUpdater.autoDownload = install && !macSelfInstall
  autoUpdater.autoInstallOnAppQuit = install && !macSelfInstall
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

/** Called when the operator opens a file: from then on an update waits for a restart. */
export function noteFileOpened(): void {
  if (fileOpenedSinceLaunch) return
  fileOpenedSinceLaunch = true
  refreshStartupFlag()
}

/** The operator pressed Skip on the start-up update. */
export function skipStartupUpdate(): void {
  skipped = true
  refreshStartupFlag()
}

function refreshStartupFlag(): void {
  if (status.state === 'available' || status.state === 'downloading' || status.state === 'ready') {
    setStatus({ ...status, atStartup: atStartup() })
  }
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

export interface SetupOptions {
  /** Unsigned Mac that can replace its own app (policy.macBlocker returned null). */
  macSelfInstall: boolean
  /** Why this copy only offers the download page (unsigned Mac that cannot replace itself). */
  manualReason?: string | undefined
  /** What the last Mac install did, if anything. */
  lastMacResult: MacResult | null
  /** Saves and closes the data file before a restart. */
  closeFile: () => Promise<void>
}

export function setupUpdater(
  initialMode: UpdateMode,
  initialPrefs: UpdatePrefs,
  options: SetupOptions
): void {
  platformMode = initialMode
  mode = initialMode
  status = { state: 'idle', mode }
  macSelfInstall = options.macSelfInstall
  manualReason = options.manualReason
  macFailed = options.lastMacResult && !options.lastMacResult.ok ? options.lastMacResult : null
  closeFile = options.closeFile
  if (options.lastMacResult) {
    log.info(
      `mac update: last install of ${options.lastMacResult.version}: ${options.lastMacResult.message}`
    )
  }
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
    startup = false
    setStatus({
      state: 'up-to-date',
      mode,
      version: info.version,
      checkedAt: new Date().toISOString()
    })
  })
  autoUpdater.on('update-available', (info) => {
    const failedHere = macSelfInstall && macFailed?.version === info.version
    const statusMode: UpdateMode = failedHere ? 'manual-download' : mode
    const reason = failedHere
      ? `Locker Manager tried to install version ${info.version} by itself, but ${macFailed?.message ?? 'it did not work'}. Install it from the download page.`
      : statusMode === 'manual-download'
        ? manualReason
        : undefined
    const notes = releaseNotesText(info)
    setStatus({
      state: 'available',
      mode: statusMode,
      version: info.version,
      downloadPageUrl: releasePageUrl(brand.repoUrl, info.version),
      atStartup: statusMode === 'auto' && atStartup(),
      ...(reason !== undefined ? { manualReason: reason } : {}),
      ...(notes !== undefined ? { releaseNotes: notes } : {}),
      ...(info.releaseDate ? { releaseDate: info.releaseDate } : {})
    })
    if (statusMode !== 'auto') startup = false
    if (macSelfInstall && mode === 'auto' && !failedHere) void downloadForMac(info)
  })
  autoUpdater.on('download-progress', (p) => {
    const version =
      status.state === 'available' || status.state === 'downloading' ? status.version : 'unknown'
    setStatus({
      state: 'downloading',
      mode,
      version,
      percent: Math.round(p.percent),
      atStartup: atStartup()
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    onReady(info.version, releaseNotesText(info))
  })
  autoUpdater.on('error', (error) => {
    // Quiet unless the operator asked (SPEC.md 9.4): school proxies fail often.
    log.warn('update check failed', error.message)
    startup = false
    setStatus({ state: 'error', mode, message: error.message, manual: manualCheck })
    manualCheck = false
  })

  applyUpdatePrefs(initialPrefs)
  app.on('before-quit', () => {
    if (timer) clearTimeout(timer)
    if (interval) clearInterval(interval)
  })
  // The Mac equivalent of electron-updater's install-on-quit.
  app.on('will-quit', () => {
    if (macSelfInstall && macStaged && mode === 'auto' && !installing) {
      installing = true
      installMacUpdate({ newApp: macStaged.app, version: macStaged.version, relaunch: false })
    }
  })
}

async function downloadForMac(info: UpdateInfo): Promise<void> {
  if (macDownloading === info.version) return
  if (macStaged?.version === info.version) {
    // A later check found the same version again; it is still ready.
    onReady(info.version, releaseNotesText(info))
    return
  }
  const file = macZipFile(info.files)
  if (!file) {
    log.warn(`mac update: release ${info.version} has no ZIP`)
    return
  }
  macDownloading = info.version
  const notes = releaseNotesText(info)
  try {
    const newApp = await prepareMacUpdate({
      url: releaseFileUrl(brand.repoUrl, info.version, file.url),
      sha512: file.sha512,
      version: info.version,
      onProgress: (percent) =>
        setStatus({
          state: 'downloading',
          mode,
          version: info.version,
          percent,
          atStartup: atStartup()
        })
    })
    macStaged = { version: info.version, app: newApp }
    onReady(info.version, notes)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.warn('mac update: download failed', message)
    startup = false
    setStatus({ state: 'error', mode, message, manual: true })
  } finally {
    macDownloading = null
  }
}

function onReady(version: string, notes: string | undefined): void {
  const now = atStartup()
  setStatus({
    state: 'ready',
    mode,
    version,
    atStartup: now,
    ...(notes !== undefined ? { releaseNotes: notes } : {})
  })
  startup = false
  if (now) {
    log.info(`update ${version} ready before any file was opened; restarting to install it`)
    void installUpdateNow(closeFile).then((r) => {
      if (!r.started) {
        log.info('start-up install did not start', r.reason)
        setStatus({ ...status, atStartup: false } as UpdateStatus)
      }
    })
  }
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
  if (macSelfInstall) {
    if (!macStaged) return { started: false, reason: 'No update has been downloaded yet.' }
    installing = true
    installMacUpdate({ newApp: macStaged.app, version: macStaged.version, relaunch: true })
    setImmediate(() => app.quit())
    return { started: true }
  }
  setImmediate(() => autoUpdater.quitAndInstall(true, true))
  return { started: true }
}

export async function openDownloadPage(): Promise<void> {
  const url = status.state === 'available' ? status.downloadPageUrl : brand.releasesUrl
  await shell.openExternal(url)
}
