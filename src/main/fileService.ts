import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import log from 'electron-log/main'
import { brand } from '@shared/brand'
import type { FileState } from '@shared/fileState'
import {
  BackupRefSchema,
  channels,
  CopyNameSchema,
  FilePathSchema,
  NewFileSchema,
  OperatorSetSchema,
  RenameSchoolSchema,
  ResolveConflictSchema,
  ResolveCopySchema,
  type ActionResult,
  type OperatorInfo,
  type RecentFile
} from '@shared/ipc'
import { setBusy } from './busy'
import { createNewDatabase } from './db/newFile'
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { revealCode } from './repos/codes'
import { exportWorkbook, importWorkbook } from './portable/workbook'
import { saveOutput, stampDate } from './renderService'
import { createDemoDatabase } from './demo/demoSchool'
import { nodeFs } from './file/fsPort'
import { DataFileSession } from './file/session'
import { machineName, Preferences, suggestedOperatorName } from './prefs/preferences'
import { savedMappings, setSavedMappingsReader } from './rpc/studentHandlers'

// Connects the Electron-free DataFileSession to dialogs, the window and IPC.
// No student data is ever logged (SPEC.md 8.1): only actions and outcomes.

let prefs: Preferences
let session: DataFileSession
let suggested = 'Staff member'

const FILTERS = [{ name: `${brand.name} data file`, extensions: [brand.fileExtension] }]

function operatorName(): string {
  return prefs.get().operatorName ?? suggested
}

let recordedRecent = ''

function broadcast(state: FileState): void {
  // Keep the recent-files list showing the school's current name.
  if (state.status === 'open' && !state.summary.demo) {
    const key = `${state.path}|${state.summary.schoolName}`
    if (key !== recordedRecent) {
      recordedRecent = key
      void prefs
        .rememberRecent(state.path, state.summary.schoolName, new Date())
        .catch(() => undefined)
    }
  }
  setBusy({
    saving: state.status === 'open' && state.saving,
    unsavedChanges: state.status === 'open' && state.dirty
  })
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channels.fileState, state)
  }
}

export async function initFileService(): Promise<void> {
  prefs = new Preferences(app.getPath('userData'))
  await prefs.load()
  suggested = await suggestedOperatorName().catch(() => 'Staff member')
  session = new DataFileSession({
    fs: nodeFs,
    appVersion: app.getVersion(),
    operator: () => ({ operator: operatorName(), machine: machineName() }),
    now: () => new Date(),
    randomSuffix: () => randomBytes(6).toString('hex'),
    localBackupRoot: join(app.getPath('userData'), 'backups'),
    sessionId: randomUUID(),
    pid: process.pid,
    env: { home: homedir(), tmpDir: tmpdir(), platform: process.platform },
    ignoredCopies: (p) => prefs.get().ignoredCopies[p] ?? [],
    onChange: broadcast
  })
}

export function fileSession(): DataFileSession {
  return session
}

/** Mappings remembered in the open file, for the import screen (empty if none open). */
setSavedMappingsReader(() => (session?.isOpen ? session.read((db) => savedMappings(db)) : {}))

function focusedWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

/** broadcast() adds an opened file to the recent files; this only logs refusals. */
function afterOpen(result: { ok: true } | { ok: false; message: string }): ActionResult {
  if (!result.ok) log.info('open refused', result.message.slice(0, 60))
  return result
}

/** Opens a path that came from the operating system (double-click, Open With). */
export async function openFromOs(path: string): Promise<void> {
  if (!/\.lockers$/i.test(path)) return
  const result = afterOpen(await session.open(path))
  if (!result.ok) {
    const win = focusedWindow()
    const opts = {
      type: 'warning' as const,
      message: 'That file could not be opened.',
      detail: result.message
    }
    if (win) await dialog.showMessageBox(win, opts)
    else await dialog.showMessageBox(opts)
  }
}

export function registerFileHandlers(): void {
  ipcMain.handle(channels.operatorGet, (): OperatorInfo => ({
    name: prefs.get().operatorName,
    suggested,
    machine: machineName()
  }))
  ipcMain.handle(channels.operatorSet, async (_e, raw: unknown) => {
    const { name } = OperatorSetSchema.parse(raw)
    await prefs.update((p) => ({ ...p, operatorName: name }))
  })

  ipcMain.handle(channels.fileGetState, () => session.state)

  ipcMain.handle(channels.fileRecent, (): RecentFile[] =>
    prefs.get().recentFiles.map((r) => ({
      path: r.path,
      fileName: basename(r.path),
      folder: dirname(r.path),
      schoolName: r.schoolName ?? null,
      openedAt: r.openedAt,
      exists: existsSync(r.path)
    }))
  )
  ipcMain.handle(channels.fileForgetRecent, async (_e, raw: unknown) => {
    const { path } = FilePathSchema.parse(raw)
    await prefs.forgetRecent(path)
  })

  ipcMain.handle(channels.fileOpenDialog, async (): Promise<ActionResult> => {
    const win = focusedWindow()
    const opts = { title: 'Open a data file', properties: ['openFile' as const], filters: FILTERS }
    const pick = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    const path = pick.filePaths[0]
    if (pick.canceled || !path) return { ok: false, cancelled: true, message: '' }
    return afterOpen(await session.open(path))
  })

  ipcMain.handle(channels.fileOpenPath, async (_e, raw: unknown): Promise<ActionResult> => {
    const { path } = FilePathSchema.parse(raw)
    return afterOpen(await session.open(path))
  })

  ipcMain.handle(channels.fileNew, async (_e, raw: unknown): Promise<ActionResult> => {
    const { schoolName } = NewFileSchema.parse(raw)
    const win = focusedWindow()
    const opts = {
      title: 'Where should the data file live?',
      buttonLabel: 'Create',
      defaultPath: join(app.getPath('documents'), 'Locker data.lockers'),
      filters: FILTERS
    }
    const pick = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (pick.canceled || !pick.filePath) return { ok: false, cancelled: true, message: '' }
    const path = /\.lockers$/i.test(pick.filePath) ? pick.filePath : `${pick.filePath}.lockers`
    if (existsSync(path)) {
      return {
        ok: false,
        message:
          'A file with that name is already there. Choose another name, or open that file instead.'
      }
    }
    const db = await createNewDatabase(
      { operator: operatorName(), machine: machineName(), now: () => new Date() },
      { schoolName, appVersion: app.getVersion() }
    )
    log.info('new data file created')
    return afterOpen(await session.createNew(path, db))
  })

  ipcMain.handle(channels.fileOpenDemo, async (): Promise<ActionResult> => {
    // The demo always starts fresh, in this computer's own app folder.
    await session.close()
    const folder = join(app.getPath('userData'), 'Demo')
    await rm(folder, { recursive: true, force: true })
    await nodeFs.mkdirp(folder)
    const path = join(folder, 'Demo school.lockers')
    const db = await createDemoDatabase(
      { operator: operatorName(), machine: machineName(), now: () => new Date() },
      app.getVersion()
    )
    return afterOpen(await session.createNew(path, db))
  })

  // A named backup before a big change (the year rollover).
  ipcMain.handle(
    channels.fileNamedBackup,
    async (_e, raw: unknown): Promise<ActionResult & { warning?: string }> => {
      const { label } = z.object({ label: z.string().trim().min(1).max(60) }).parse(raw)
      try {
        const warning = await session.keepNamedBackup(label)
        session.write({ action: 'file.named_backup', entity: 'file', after: { label } }, () => null)
        return warning ? { ok: true, warning } : { ok: true }
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) }
      }
    }
  )

  // The whole file as a portable Excel workbook (SPEC.md 5.5).
  ipcMain.handle(
    channels.fileExportAll,
    async (_e, raw: unknown): Promise<ActionResult & { path?: string }> => {
      const { includeCodes } = z.object({ includeCodes: z.boolean() }).parse(raw)
      const st = session.state
      if (st.status !== 'open') return { ok: false, message: 'Open a file first.' }
      if (includeCodes && (st.mode !== 'edit' || st.conflict))
        return {
          ok: false,
          message:
            'Open the file for editing to export codes: every code exported is recorded. You can export without codes now.'
        }
      const { bytes, lockerIds, school } = await session.read(async (db) => ({
        bytes: await exportWorkbook(db, {
          operator: operatorName(),
          appVersion: app.getVersion(),
          includeCodes,
          now: new Date()
        }),
        lockerIds: includeCodes
          ? db
              .all<{ locker_id: string }>(
                "SELECT locker_id FROM lock WHERE locker_id IS NOT NULL AND code_cipher IS NOT NULL AND status IN ('in_use','spare')"
              )
              .map((r) => r.locker_id)
          : [],
        school: st.summary.schoolName
      }))
      const path = await saveOutput(
        `${includeCodes ? 'CONFIDENTIAL ' : ''}${school} portable export ${stampDate()}.xlsx`,
        bytes,
        { name: 'Excel workbook', extension: 'xlsx' }
      )
      if (!path) return { ok: false, cancelled: true, message: '' }
      if (st.mode === 'edit' && !st.conflict)
        session.write(
          {
            action: 'file.exported',
            entity: 'file',
            after: { includeCodes, codes: lockerIds.length }
          },
          (db, ctx) => {
            for (const id of lockerIds) revealCode(db, ctx, id, 'export')
          }
        )
      log.info('portable export written', { includeCodes })
      return { ok: true, path }
    }
  )

  // A new data file from a portable export. The workbook's file is never changed.
  ipcMain.handle(channels.fileFromExport, async (): Promise<ActionResult> => {
    const win = focusedWindow()
    const openOpts = {
      title: 'Choose a Locker Manager portable export',
      properties: ['openFile' as const],
      filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }]
    }
    const pick = win
      ? await dialog.showOpenDialog(win, openOpts)
      : await dialog.showOpenDialog(openOpts)
    const source = pick.filePaths[0]
    if (pick.canceled || !source) return { ok: false, cancelled: true, message: '' }
    let built: Awaited<ReturnType<typeof importWorkbook>>
    try {
      built = await importWorkbook(new Uint8Array(await readFile(source)), {
        operator: operatorName(),
        machine: machineName(),
        now: () => new Date()
      })
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
    const saveOpts = {
      title: 'Where should the new data file live?',
      buttonLabel: 'Create',
      defaultPath: join(app.getPath('documents'), `${built.school} (from export).lockers`),
      filters: FILTERS
    }
    const target = win
      ? await dialog.showSaveDialog(win, saveOpts)
      : await dialog.showSaveDialog(saveOpts)
    if (target.canceled || !target.filePath) {
      built.db.close()
      return { ok: false, cancelled: true, message: '' }
    }
    const path = /\.lockers$/i.test(target.filePath)
      ? target.filePath
      : `${target.filePath}.lockers`
    if (existsSync(path)) {
      built.db.close()
      return { ok: false, message: 'A file with that name is already there. Choose another name.' }
    }
    log.info('data file rebuilt from a portable export', { codes: built.codesIncluded })
    return afterOpen(await session.createNew(path, built.db))
  })

  ipcMain.handle(channels.fileClose, async () => {
    await session.close()
  })

  ipcMain.handle(channels.fileShowInFolder, () => {
    const s = session.state
    if (s.status === 'open') shell.showItemInFolder(s.path)
  })

  ipcMain.handle(channels.fileUndo, async (): Promise<ActionResult> => session.undo())
  ipcMain.handle(channels.fileRedo, async (): Promise<ActionResult> => session.redo())

  ipcMain.handle(channels.fileTakeOver, async (): Promise<ActionResult> => {
    log.info('take over editing requested')
    return session.takeOver()
  })
  ipcMain.handle(channels.fileStartEditing, async (): Promise<ActionResult> =>
    session.startEditing()
  )

  ipcMain.handle(channels.fileResolveConflict, async (_e, raw: unknown): Promise<ActionResult> => {
    const { choice } = ResolveConflictSchema.parse(raw)
    log.info('conflict resolved', choice)
    return session.resolveConflict(choice)
  })
  ipcMain.handle(channels.fileCompareCopy, async (_e, raw: unknown): Promise<ActionResult> => {
    const { name } = CopyNameSchema.parse(raw)
    return session.compareCopy(name)
  })
  ipcMain.handle(channels.fileCloseComparison, () => session.closeComparison())
  ipcMain.handle(channels.fileResolveCopy, async (_e, raw: unknown): Promise<ActionResult> => {
    const { name, choice } = ResolveCopySchema.parse(raw)
    const s = session.state
    if (choice === 'ignore') {
      if (s.status === 'open') await prefs.ignoreCopy(s.path, name)
      session.closeComparison()
      if (s.status === 'open') await session.open(s.path)
      return { ok: true }
    }
    return session.resolveCopy(name, choice)
  })

  ipcMain.handle(channels.backupsList, () => session.listAllBackups())
  ipcMain.handle(channels.backupsPreview, async (_e, raw: unknown) =>
    session.previewBackup(BackupRefSchema.parse(raw))
  )
  ipcMain.handle(channels.backupsRestore, async (_e, raw: unknown): Promise<ActionResult> => {
    log.info('restore requested')
    return session.restoreBackup(BackupRefSchema.parse(raw))
  })

  ipcMain.handle(channels.schoolRename, (_e, raw: unknown): ActionResult => {
    const { name } = RenameSchoolSchema.parse(raw)
    try {
      session.write({ action: 'school.renamed', entity: 'school' }, (db) => {
        const before = db.get<{ id: string; name: string }>('SELECT id, name FROM school LIMIT 1')
        db.run('UPDATE school SET name = $n, updated_at = $at, updated_by = $by', {
          $n: name,
          $at: new Date().toISOString(),
          $by: operatorName()
        })
        return before
      })
      return { ok: true }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  })
}
