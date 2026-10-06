import { contextBridge, ipcRenderer } from 'electron'
import { channels } from '../shared/channels'
import type { AppInfo, InstallResult, UpdateStatus } from '../shared/ipc'

// The only bridge between the sandboxed page and the main process. Every
// function here maps to one validated IPC handler.
const api = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(channels.appGetInfo),
  getUpdateStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke(channels.updateGetStatus),
  checkForUpdates: (): Promise<void> => ipcRenderer.invoke(channels.updateCheck),
  installUpdate: (): Promise<InstallResult> => ipcRenderer.invoke(channels.updateInstall),
  openDownloadPage: (): Promise<void> => ipcRenderer.invoke(channels.updateOpenDownloadPage),
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke(channels.shellOpenExternal, { url }),
  onUpdateStatus: (listener: (status: UpdateStatus) => void): (() => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, status: UpdateStatus): void =>
      listener(status)
    ipcRenderer.on(channels.updateStatus, wrapped)
    return () => ipcRenderer.removeListener(channels.updateStatus, wrapped)
  },
  onOpenAbout: (listener: () => void): (() => void) => {
    const wrapped = (): void => listener()
    ipcRenderer.on(channels.openAbout, wrapped)
    return () => ipcRenderer.removeListener(channels.openAbout, wrapped)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
