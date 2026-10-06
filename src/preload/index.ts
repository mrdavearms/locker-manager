import { contextBridge, ipcRenderer } from 'electron'
import { channels } from '../shared/channels'
import type { BackupPreview, BackupView, FileState } from '../shared/fileState'
import type {
  ActionResult,
  AppInfo,
  InstallResult,
  OperatorInfo,
  RecentFile,
  UpdateStatus
} from '../shared/ipc'

// The only bridge between the sandboxed page and the main process. Every
// function here maps to one IPC handler that validates its input with Zod.

type BackupRef = { source: BackupView['source']; name: string }

function subscribe<T>(channel: string, listener: (value: T) => void): () => void {
  const wrapped = (_event: Electron.IpcRendererEvent, value: T): void => listener(value)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

const api = {
  // app and updates
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(channels.appGetInfo),
  getUpdateStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke(channels.updateGetStatus),
  checkForUpdates: (): Promise<void> => ipcRenderer.invoke(channels.updateCheck),
  installUpdate: (): Promise<InstallResult> => ipcRenderer.invoke(channels.updateInstall),
  openDownloadPage: (): Promise<void> => ipcRenderer.invoke(channels.updateOpenDownloadPage),
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke(channels.shellOpenExternal, { url }),
  onUpdateStatus: (listener: (status: UpdateStatus) => void) =>
    subscribe(channels.updateStatus, listener),
  onOpenAbout: (listener: () => void) => subscribe<void>(channels.openAbout, () => listener()),

  // who is using this computer
  getOperator: (): Promise<OperatorInfo> => ipcRenderer.invoke(channels.operatorGet),
  setOperator: (name: string): Promise<void> => ipcRenderer.invoke(channels.operatorSet, { name }),

  // the data file
  getFileState: (): Promise<FileState> => ipcRenderer.invoke(channels.fileGetState),
  onFileState: (listener: (state: FileState) => void) => subscribe(channels.fileState, listener),
  recentFiles: (): Promise<RecentFile[]> => ipcRenderer.invoke(channels.fileRecent),
  forgetRecent: (path: string): Promise<void> =>
    ipcRenderer.invoke(channels.fileForgetRecent, { path }),
  openFileDialog: (): Promise<ActionResult> => ipcRenderer.invoke(channels.fileOpenDialog),
  openFilePath: (path: string): Promise<ActionResult> =>
    ipcRenderer.invoke(channels.fileOpenPath, { path }),
  newFile: (schoolName: string): Promise<ActionResult> =>
    ipcRenderer.invoke(channels.fileNew, { schoolName }),
  openDemo: (): Promise<ActionResult> => ipcRenderer.invoke(channels.fileOpenDemo),
  closeFile: (): Promise<void> => ipcRenderer.invoke(channels.fileClose),
  showInFolder: (): Promise<void> => ipcRenderer.invoke(channels.fileShowInFolder),
  takeOver: (): Promise<ActionResult> => ipcRenderer.invoke(channels.fileTakeOver),
  startEditing: (): Promise<ActionResult> => ipcRenderer.invoke(channels.fileStartEditing),
  resolveConflict: (choice: 'keep_mine' | 'keep_theirs'): Promise<ActionResult> =>
    ipcRenderer.invoke(channels.fileResolveConflict, { choice }),
  compareCopy: (name: string): Promise<ActionResult> =>
    ipcRenderer.invoke(channels.fileCompareCopy, { name }),
  closeComparison: (): Promise<void> => ipcRenderer.invoke(channels.fileCloseComparison),
  resolveCopy: (
    name: string,
    choice: 'keep_current' | 'use_copy' | 'ignore'
  ): Promise<ActionResult> => ipcRenderer.invoke(channels.fileResolveCopy, { name, choice }),

  // backups
  listBackups: (): Promise<BackupView[]> => ipcRenderer.invoke(channels.backupsList),
  previewBackup: (ref: BackupRef): Promise<BackupPreview | { error: string }> =>
    ipcRenderer.invoke(channels.backupsPreview, ref),
  restoreBackup: (ref: BackupRef): Promise<ActionResult> =>
    ipcRenderer.invoke(channels.backupsRestore, ref),

  // school
  renameSchool: (name: string): Promise<ActionResult> =>
    ipcRenderer.invoke(channels.schoolRename, { name })
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
