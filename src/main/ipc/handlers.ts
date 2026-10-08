import { app, ipcMain, shell } from 'electron'
import log from 'electron-log/main'
import { brand } from '@shared/brand'
import { isAllowedExternalUrl } from '@shared/externalUrls'
import { AppInfoSchema, channels, OpenExternalSchema, type AppInfo } from '@shared/ipc'
import { buildCommit, buildDate } from '../buildInfo'
import { fileSession } from '../fileService'
import {
  checkForUpdates,
  getUpdateStatus,
  installUpdateNow,
  openDownloadPage,
  skipStartupUpdate
} from '../update/updater'

export function registerIpcHandlers(signed: boolean): void {
  ipcMain.handle(channels.appGetInfo, (): AppInfo => {
    return AppInfoSchema.parse({
      name: brand.name,
      version: app.getVersion(),
      commit: buildCommit,
      builtAt: buildDate,
      platform: process.platform,
      arch: process.arch,
      packaged: app.isPackaged,
      signed,
      electron: process.versions.electron,
      chromium: process.versions.chrome,
      node: process.versions.node,
      licence: brand.licence,
      repoUrl: brand.repoUrl,
      releasesUrl: brand.releasesUrl
    })
  })

  ipcMain.handle(channels.updateGetStatus, () => getUpdateStatus())
  ipcMain.handle(channels.updateCheck, async () => {
    await checkForUpdates(true)
  })
  ipcMain.handle(channels.updateInstall, () => installUpdateNow(() => fileSession().close()))
  ipcMain.handle(channels.updateOpenDownloadPage, async () => {
    await openDownloadPage()
  })
  ipcMain.handle(channels.updateSkipStartup, () => {
    skipStartupUpdate()
  })

  ipcMain.handle(channels.shellOpenExternal, async (_event, raw: unknown) => {
    const { url } = OpenExternalSchema.parse(raw)
    if (!isAllowedExternalUrl(url)) {
      log.warn('refused to open external url', url)
      throw new Error('That address is not one the app will open.')
    }
    await shell.openExternal(url)
  })
}
