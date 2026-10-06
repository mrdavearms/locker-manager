import { basename, dirname, join } from 'node:path'
import type {
  BackupPreview,
  BackupView,
  ConflictView,
  FileProblemView,
  FileState,
  ReadOnlyView
} from '@shared/fileState'
import { LockerDb } from '../db/db'
import { appendAudit, getMeta, type AuditEntry, type OperatorContext } from '../db/context'
import { migrate, schemaState } from '../db/migrate'
import { historyOnlyIn, summarise } from '../db/summary'
import { saveAtomically, SaveFailedError } from './atomicSave'
import {
  BACKUP_FOLDER_NAME,
  DEFAULT_POLICY,
  listBackups,
  sharedBackupDir,
  writeBackup,
  type BackupPolicy
} from './backups'
import { errorCode, type FsPort } from './fsPort'
import { sha256 } from './hash'
import {
  acquireLock,
  heartbeat,
  HEARTBEAT_MS,
  lockPathFor,
  readLock,
  releaseLock,
  classifyLock,
  takeOverLock,
  type LockInfo
} from './lockFile'
import { readDataFile, readProblemMessage } from './readDataFile'
import {
  baseName,
  findConflictCopies,
  leftoverTempFiles,
  locationWarning,
  locationWarningMessage
} from './siblings'

type Timer = ReturnType<typeof setTimeout>

export interface SessionDeps {
  fs: FsPort
  appVersion: string
  /** Read at the moment of each change, so a renamed operator applies at once. */
  operator: () => { operator: string; machine: string }
  now: () => Date
  randomSuffix: () => string
  /** This computer's own backup folder (SPEC.md 6.5). */
  localBackupRoot: string
  sessionId: string
  pid: number
  env: { home: string; tmpDir: string; platform: NodeJS.Platform }
  /** Sync copies the operator has said are not copies. */
  ignoredCopies?: (dataPath: string) => string[]
  onChange?: (state: FileState) => void
  saveDelayMs?: number
  heartbeatMs?: number
  pollMs?: number
  saveRetryMs?: number
  backupPolicy?: BackupPolicy
  timers?: {
    setTimeout: (fn: () => void, ms: number) => Timer
    clearTimeout: (t: Timer) => void
  }
}

export type OpenResult = { ok: true } | { ok: false; message: string }

interface Open {
  path: string
  db: LockerDb
  /** Hash of the file on disk as last read or written by us; null = it must not exist. */
  hash: string | null
  mtimeMs: number
  size: number
  mode: 'edit' | 'read_only'
  readOnly: ReadOnlyView | null
  dirty: boolean
  /** Incremented on every change; a save clears dirty only if nothing changed meanwhile. */
  changeCounter: number
  saving: boolean
  saveAgain: boolean
  lastSavedAt: string | null
  lastBackupAt: string | null
  problems: FileProblemView[]
  conflict: (ConflictView & { diskBytes: Uint8Array | null; diskHash: string | null }) | null
  conflictCopies: string[]
  locationWarning: string | null
  openedAt: string
  revision: number
}

const DAY = 24 * 60 * 60 * 1000

export class DataFileSession {
  private cur: Open | null = null
  private saveTimer: Timer | null = null
  private tickTimer: Timer | null = null
  private readonly me: LockInfo

  constructor(private readonly d: SessionDeps) {
    const op = d.operator()
    this.me = {
      format: 1,
      sessionId: d.sessionId,
      operator: op.operator,
      computer: op.machine,
      appVersion: d.appVersion,
      pid: d.pid,
      startedAt: d.now().toISOString(),
      heartbeatAt: d.now().toISOString()
    }
  }

  // ---------------------------------------------------------------- state

  get state(): FileState {
    const c = this.cur
    if (!c) return { status: 'closed' }
    const conflict = c.conflict
    return {
      status: 'open',
      path: c.path,
      fileName: basename(c.path),
      folder: dirname(c.path),
      mode: c.mode,
      readOnly: c.readOnly,
      summary: summarise(c.db),
      dirty: c.dirty,
      saving: c.saving,
      lastSavedAt: c.lastSavedAt,
      lastBackupAt: c.lastBackupAt,
      problems: c.problems,
      conflict: conflict
        ? {
            reason: conflict.reason,
            copyName: conflict.copyName,
            mine: conflict.mine,
            theirs: conflict.theirs,
            onlyMine: conflict.onlyMine,
            onlyTheirs: conflict.onlyTheirs
          }
        : null,
      conflictCopies: c.conflictCopies,
      locationWarning: c.locationWarning,
      openedAt: c.openedAt,
      revision: c.revision
    }
  }

  get isOpen(): boolean {
    return this.cur !== null
  }

  get hasUnsavedChanges(): boolean {
    return this.cur?.dirty === true
  }

  get isSaving(): boolean {
    return this.cur?.saving === true
  }

  private emit(): void {
    this.d.onChange?.(this.state)
  }

  private ctx(): OperatorContext {
    const op = this.d.operator()
    return { operator: op.operator, machine: op.machine, now: this.d.now }
  }

  private lockDeps() {
    const op = this.d.operator()
    const me: LockInfo = { ...this.me, operator: op.operator, computer: op.machine }
    return {
      fs: this.d.fs,
      lockPath: lockPathFor(this.cur?.path ?? ''),
      me,
      now: this.d.now,
      randomSuffix: this.d.randomSuffix
    }
  }

  private problem(kind: FileProblemView['kind'], message: string): void {
    if (!this.cur) return
    this.cur.problems = [
      ...this.cur.problems.filter((p) => p.kind !== kind),
      { kind, message, at: this.d.now().toISOString() }
    ]
  }

  private clearProblem(kind: FileProblemView['kind']): void {
    if (!this.cur) return
    this.cur.problems = this.cur.problems.filter((p) => p.kind !== kind)
  }

  private get timers() {
    return (
      this.d.timers ?? {
        setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
        clearTimeout: (t: Timer) => clearTimeout(t)
      }
    )
  }

  // ----------------------------------------------------------------- open

  /** Creates a new data file at path. Fails if a file is already there. */
  async createNew(path: string, db: LockerDb): Promise<OpenResult> {
    if (this.cur) await this.close()
    const bytes = db.export()
    try {
      const out = await saveAtomically({
        fs: this.d.fs,
        path,
        bytes,
        expectedHash: null,
        randomSuffix: this.d.randomSuffix
      })
      if (out.kind === 'conflict')
        return {
          ok: false,
          message: 'A file with that name is already there. Choose another name.'
        }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    } finally {
      db.close()
    }
    return this.open(path)
  }

  async open(path: string): Promise<OpenResult> {
    if (this.cur) await this.close()
    const read = await readDataFile(this.d.fs, path)
    if (!read.ok) return { ok: false, message: readProblemMessage(read.problem) }

    let db: LockerDb
    try {
      db = await LockerDb.fromBytes(read.bytes)
    } catch {
      return { ok: false, message: readProblemMessage('not_a_data_file') }
    }
    const problems = db.integrityProblems()
    if (problems.length > 0) {
      db.close()
      return {
        ok: false,
        message: `This file is damaged (${problems[0] ?? 'integrity check failed'}). Open a backup from the "${BACKUP_FOLDER_NAME}" folder beside it.`
      }
    }

    const now = this.d.now().toISOString()
    this.cur = {
      path,
      db,
      hash: read.hash,
      mtimeMs: read.mtimeMs,
      size: read.size,
      mode: 'read_only',
      readOnly: null,
      dirty: false,
      changeCounter: 0,
      saving: false,
      saveAgain: false,
      lastSavedAt: null,
      lastBackupAt: null,
      problems: [],
      conflict: null,
      conflictCopies: [],
      locationWarning: null,
      openedAt: now,
      revision: 0
    }
    const c = this.cur

    const schema = schemaState(db)
    if (schema.kind === 'newer') {
      c.readOnly = {
        reason: 'newer_version',
        holder: null,
        canTakeOver: false,
        canStartEditing: false
      }
    } else {
      const lock = await acquireLock(this.lockDeps()).catch(() => null)
      if (lock === null) {
        this.problem(
          'lock_failed',
          'Could not write the edit lock beside the file. Opening read-only.'
        )
        c.readOnly = { reason: 'locked', holder: null, canTakeOver: true, canStartEditing: false }
      } else if (lock.result === 'acquired') {
        c.mode = 'edit'
      } else {
        c.readOnly = {
          reason: lock.result === 'held' ? 'locked' : 'stale_lock',
          holder: lock.info ? holderView(lock.info) : null,
          canTakeOver: lock.result === 'stale',
          canStartEditing: false
        }
      }
      if (schema.kind === 'older') {
        if (c.mode === 'edit') {
          // SPEC.md 6.6: named backup, migrate, verify, save.
          await this.backupBytes(read.bytes, `before update to ${this.d.appVersion}`)
          migrate(db)
          appendAudit(db, this.ctx(), {
            action: 'file.migrated',
            entity: 'file',
            after: { from: schema.from, to: schema.to, appVersion: this.d.appVersion }
          })
          this.markChanged()
          await this.flush()
        } else {
          // Viewing only: bring it up to date in memory, never write it.
          migrate(db)
        }
      }
    }

    await this.scanSiblings()
    const newest = (await this.listAllBackups())[0]
    if (newest) c.lastBackupAt = newest.at
    const w = locationWarning(path, this.d.env)
    c.locationWarning = w ? locationWarningMessage(w, path) : null
    this.startTicking()
    this.emit()
    return { ok: true }
  }

  private async scanSiblings(): Promise<void> {
    const c = this.cur
    if (!c) return
    const folder = dirname(c.path)
    const name = basename(c.path)
    let siblings: string[]
    try {
      siblings = await this.d.fs.readdir(folder)
    } catch {
      return
    }
    const ignored = new Set(this.d.ignoredCopies?.(c.path) ?? [])
    c.conflictCopies = findConflictCopies(name, siblings).filter((n) => !ignored.has(n))
    // Leftovers older than a day are tidied (SPEC.md 6.3). Younger ones may be
    // another computer's save in progress.
    for (const leftover of leftoverTempFiles(name, siblings)) {
      try {
        const s = await this.d.fs.stat(join(folder, leftover))
        if (this.d.now().getTime() - s.mtimeMs > DAY) await this.d.fs.unlink(join(folder, leftover))
      } catch {
        // best effort
      }
    }
  }

  // --------------------------------------------------------------- change

  /**
   * Runs one change in a transaction with its history entry, then schedules a
   * save. The entry may be built from the change's result (for example a new id).
   */
  write<T>(
    entry: AuditEntry | ((result: T) => AuditEntry),
    fn: (db: LockerDb, ctx: OperatorContext) => T
  ): T {
    const c = this.cur
    if (!c) throw new Error('No file is open.')
    if (c.mode !== 'edit') throw new Error('This file is open read-only.')
    if (c.conflict) throw new Error('Sort out the conflict before making changes.')
    const ctx = this.ctx()
    const result = c.db.transaction(() => {
      const r = fn(c.db, ctx)
      appendAudit(c.db, ctx, typeof entry === 'function' ? entry(r) : entry)
      return r
    })
    this.markChanged()
    this.emit()
    return result
  }

  read<T>(fn: (db: LockerDb) => T): T {
    if (!this.cur) throw new Error('No file is open.')
    return fn(this.cur.db)
  }

  private markChanged(): void {
    const c = this.cur
    if (!c) return
    c.revision++
    c.dirty = true
    c.changeCounter++
    if (this.saveTimer) this.timers.clearTimeout(this.saveTimer)
    this.saveTimer = this.timers.setTimeout(() => {
      this.saveTimer = null
      void this.save()
    }, this.d.saveDelayMs ?? 2000)
  }

  /** Saves now if there is anything to save, and waits for it. */
  async flush(): Promise<void> {
    if (this.saveTimer) {
      this.timers.clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    while (this.cur?.saving) await new Promise((r) => setTimeout(r, 10))
    if (this.cur?.dirty && this.cur.mode === 'edit' && !this.cur.conflict) await this.save()
  }

  private async backupBytes(bytes: Uint8Array, label?: string): Promise<string | null> {
    const c = this.cur
    if (!c) return null
    const base = baseName(basename(c.path))
    const at = this.d.now()
    const policy = this.d.backupPolicy ?? DEFAULT_POLICY
    const opts = { randomSuffix: this.d.randomSuffix, policy, ...(label ? { label } : {}) }
    const errors: string[] = []
    try {
      await writeBackup(this.d.fs, sharedBackupDir(c.path), base, bytes, at, opts)
    } catch (error) {
      errors.push(`the shared folder (${errorCode(error) ?? 'error'})`)
    }
    try {
      await writeBackup(this.d.fs, this.localBackupDir(), base, bytes, at, opts)
    } catch (error) {
      errors.push(`this computer (${errorCode(error) ?? 'error'})`)
    }
    if (errors.length === 2)
      throw new Error(`No backup could be written to ${errors.join(' or ')}.`)
    c.lastBackupAt = at.toISOString()
    return errors.length > 0 ? `A backup could not be written to ${errors[0]}.` : null
  }

  private localBackupDir(): string {
    const c = this.cur
    const id = c ? (getMeta(c.db, 'file_id') ?? 'unknown') : 'unknown'
    return join(this.d.localBackupRoot, id)
  }

  private async save(): Promise<void> {
    const c = this.cur
    if (!c || c.mode !== 'edit' || c.conflict) return
    if (c.saving) {
      c.saveAgain = true
      return
    }
    c.saving = true
    const counterAtStart = c.changeCounter
    this.emit()
    let partialBackupWarning: string | null = null
    try {
      const bytes = c.db.export()
      const out = await saveAtomically({
        fs: this.d.fs,
        path: c.path,
        bytes,
        expectedHash: c.hash,
        randomSuffix: this.d.randomSuffix,
        backupPrevious: async (prev) => {
          partialBackupWarning = await this.backupBytes(prev)
        }
      })
      if (this.cur !== c) return
      if (out.kind === 'saved') {
        c.hash = out.hash
        c.mtimeMs = out.mtimeMs
        c.size = out.size
        c.lastSavedAt = this.d.now().toISOString()
        if (c.changeCounter === counterAtStart) c.dirty = false
        this.clearProblem('save_failed')
        const backupMessage = out.backupError ?? partialBackupWarning
        if (backupMessage) this.problem('backup_failed', `Saved, but ${lowerFirst(backupMessage)}`)
        else this.clearProblem('backup_failed')
      } else {
        await this.enterConflict(out.diskHash === null ? 'missing' : 'changed_on_disk')
      }
    } catch (error) {
      if (this.cur !== c) return
      const msg =
        error instanceof SaveFailedError ? error.message : `Saving failed: ${String(error)}`
      this.problem(
        'save_failed',
        `${msg} Your changes are still in the app and will be saved when this is fixed.`
      )
      this.saveTimer = this.timers.setTimeout(() => {
        this.saveTimer = null
        void this.save()
      }, this.d.saveRetryMs ?? 10_000)
    } finally {
      if (this.cur === c) {
        c.saving = false
        if (c.saveAgain) {
          c.saveAgain = false
          if (c.dirty) void this.save()
        }
        this.emit()
      }
    }
  }

  // ------------------------------------------------------------- conflict

  private async enterConflict(reason: 'changed_on_disk' | 'missing'): Promise<void> {
    const c = this.cur
    if (!c) return
    let diskBytes: Uint8Array | null = null
    let theirs: LockerDb | null = null
    if (reason === 'changed_on_disk') {
      const r = await readDataFile(this.d.fs, c.path)
      if (r.ok) {
        diskBytes = r.bytes
        theirs = await LockerDb.fromBytes(r.bytes).catch(() => null)
      }
    }
    c.conflict = {
      reason,
      copyName: null,
      mine: summarise(c.db),
      theirs: theirs ? summarise(theirs) : null,
      onlyMine: theirs ? historyOnlyIn(c.db, theirs) : [],
      onlyTheirs: theirs ? historyOnlyIn(theirs, c.db) : [],
      diskBytes,
      diskHash: diskBytes ? sha256(diskBytes) : null
    }
    theirs?.close()
    this.emit()
  }

  /**
   * Settles a conflict. Whichever version is not kept is saved as a named backup
   * first, so nothing is ever thrown away (SPEC.md 6.4).
   */
  async resolveConflict(choice: 'keep_mine' | 'keep_theirs'): Promise<OpenResult> {
    const c = this.cur
    if (!c?.conflict || c.conflict.reason === 'copy')
      return { ok: false, message: 'There is no conflict to settle.' }
    const conflict = c.conflict
    if (choice === 'keep_mine') {
      if (conflict.diskBytes) {
        const who = conflict.theirs?.lastChange?.operator ?? 'someone else'
        await this.backupBytes(conflict.diskBytes, `other version from ${who}`)
      }
      // null when the file vanished: the save then writes it back as a new file.
      c.hash = conflict.diskHash
      c.conflict = null
      appendAudit(c.db, this.ctx(), {
        action: 'conflict.kept_mine',
        entity: 'file',
        reason: 'Kept this computer’s version'
      })
      this.markChanged()
      await this.flush()
      if (c.conflict || c.dirty)
        return {
          ok: false,
          message: 'The file could not be written. Your version is still open here.'
        }
    } else {
      if (!conflict.diskBytes) return { ok: false, message: 'There is no other version to keep.' }
      await this.backupBytes(c.db.export(), `my unsaved changes`)
      await this.replaceInMemory(conflict.diskBytes)
      c.conflict = null
    }
    this.emit()
    return { ok: true }
  }

  private async replaceInMemory(bytes: Uint8Array): Promise<void> {
    const c = this.cur
    if (!c) return
    const next = await LockerDb.fromBytes(bytes)
    if (schemaState(next).kind === 'older') migrate(next)
    c.db.close()
    c.db = next
    c.revision++
    c.hash = sha256(bytes)
    c.size = bytes.byteLength
    c.dirty = false
    try {
      c.mtimeMs = (await this.d.fs.stat(c.path)).mtimeMs
    } catch {
      // ignore
    }
  }

  // --------------------------------------------------------- sync copies

  async compareCopy(copyName: string): Promise<OpenResult> {
    const c = this.cur
    if (!c || !c.conflictCopies.includes(copyName))
      return { ok: false, message: 'That copy is no longer there.' }
    const r = await readDataFile(this.d.fs, join(dirname(c.path), copyName))
    if (!r.ok) return { ok: false, message: readProblemMessage(r.problem) }
    const theirs = await LockerDb.fromBytes(r.bytes).catch(() => null)
    if (!theirs) return { ok: false, message: readProblemMessage('not_a_data_file') }
    c.conflict = {
      reason: 'copy',
      copyName,
      mine: summarise(c.db),
      theirs: summarise(theirs),
      onlyMine: historyOnlyIn(c.db, theirs),
      onlyTheirs: historyOnlyIn(theirs, c.db),
      diskBytes: r.bytes,
      diskHash: r.hash
    }
    theirs.close()
    this.emit()
    return { ok: true }
  }

  closeComparison(): void {
    if (this.cur?.conflict?.reason === 'copy') {
      this.cur.conflict = null
      this.emit()
    }
  }

  /**
   * keep_current: the copy goes into the backups folder and is removed.
   * use_copy: the current file goes into the backups folder and the copy replaces it.
   * Either way both versions survive as backups.
   */
  async resolveCopy(copyName: string, choice: 'keep_current' | 'use_copy'): Promise<OpenResult> {
    const c = this.cur
    if (!c) return { ok: false, message: 'No file is open.' }
    if (c.mode !== 'edit')
      return { ok: false, message: 'Only the person editing can sort out copies.' }
    const copyPath = join(dirname(c.path), copyName)
    const r = await readDataFile(this.d.fs, copyPath)
    if (!r.ok) return { ok: false, message: readProblemMessage(r.problem) }
    await this.flush()
    if (choice === 'keep_current') {
      await this.backupBytes(r.bytes, `copy ${baseName(copyName)}`)
      appendAudit(c.db, this.ctx(), { action: 'copy.set_aside', entity: 'file', reason: copyName })
    } else {
      await this.backupBytes(c.db.export(), `replaced by ${baseName(copyName)}`)
      const out = await saveAtomically({
        fs: this.d.fs,
        path: c.path,
        bytes: r.bytes,
        expectedHash: c.hash,
        randomSuffix: this.d.randomSuffix
      })
      if (out.kind !== 'saved')
        return {
          ok: false,
          message: 'The file changed while this was happening. Nothing was replaced.'
        }
      await this.replaceInMemory(r.bytes)
      appendAudit(c.db, this.ctx(), { action: 'copy.used', entity: 'file', reason: copyName })
    }
    try {
      await this.d.fs.unlink(copyPath)
    } catch {
      // It is backed up; if the sync service brings it back the operator can ignore it.
    }
    c.conflict = null
    c.conflictCopies = c.conflictCopies.filter((n) => n !== copyName)
    this.markChanged()
    await this.flush()
    this.emit()
    return { ok: true }
  }

  // ---------------------------------------------------------- edit lock

  async takeOver(): Promise<OpenResult> {
    const c = this.cur
    if (!c?.readOnly?.canTakeOver)
      return { ok: false, message: 'Editing cannot be taken over right now.' }
    const previous = c.readOnly.holder
    await takeOverLock(this.lockDeps())
    const r = await readDataFile(this.d.fs, c.path)
    if (!r.ok) return { ok: false, message: readProblemMessage(r.problem) }
    await this.replaceInMemory(r.bytes)
    c.mode = 'edit'
    c.readOnly = null
    this.write(
      {
        action: 'lock.taken_over',
        entity: 'file',
        before: previous,
        reason: previous
          ? `Took over from ${previous.operator} on ${previous.computer}`
          : 'Took over a damaged lock'
      },
      () => undefined
    )
    await this.flush()
    return { ok: true }
  }

  /** When the other editor has finished: reopen this file for editing. */
  async startEditing(): Promise<OpenResult> {
    const c = this.cur
    if (!c?.readOnly?.canStartEditing)
      return { ok: false, message: 'Someone else is still editing.' }
    return this.open(c.path)
  }

  // -------------------------------------------------------- ticking

  private startTicking(): void {
    this.stopTicking()
    const c = this.cur
    if (!c) return
    const ms = c.mode === 'edit' ? (this.d.heartbeatMs ?? HEARTBEAT_MS) : (this.d.pollMs ?? 5000)
    this.tickTimer = this.timers.setTimeout(() => {
      void this.tick().finally(() => {
        if (this.cur === c) this.startTicking()
      })
    }, ms)
  }

  private stopTicking(): void {
    if (this.tickTimer) this.timers.clearTimeout(this.tickTimer)
    this.tickTimer = null
  }

  /** Exposed for tests; runs one heartbeat (editing) or one poll (read-only). */
  async tick(): Promise<void> {
    const c = this.cur
    if (!c) return
    if (c.mode === 'edit') await this.editTick(c)
    else await this.readOnlyTick(c)
  }

  private async diskChanged(
    c: Open
  ): Promise<{ changed: boolean; bytes?: Uint8Array; missing?: boolean }> {
    let s: { size: number; mtimeMs: number }
    try {
      s = await this.d.fs.stat(c.path)
    } catch (error) {
      return errorCode(error) === 'ENOENT' ? { changed: true, missing: true } : { changed: false }
    }
    if (s.size === c.size && s.mtimeMs === c.mtimeMs) return { changed: false }
    const r = await readDataFile(this.d.fs, c.path)
    if (!r.ok) return { changed: false } // mid-sync; look again next time
    if (r.hash === c.hash) {
      c.mtimeMs = r.mtimeMs
      return { changed: false }
    }
    return { changed: true, bytes: r.bytes }
  }

  private async editTick(c: Open): Promise<void> {
    try {
      const hb = await heartbeat(this.lockDeps())
      if (hb.result === 'lost') {
        // Someone took over. Keep anything unsaved as a backup, then follow them.
        if (c.dirty)
          await this.backupBytes(
            c.db.export(),
            'unsaved changes when editing was taken over'
          ).catch(() => null)
        c.mode = 'read_only'
        c.readOnly = {
          reason: 'lost_lock',
          holder: hb.info ? holderView(hb.info) : null,
          canTakeOver: false,
          canStartEditing: false
        }
        c.dirty = false
        if (this.saveTimer) this.timers.clearTimeout(this.saveTimer)
        this.saveTimer = null
        const r = await readDataFile(this.d.fs, c.path)
        if (r.ok) await this.replaceInMemory(r.bytes)
        this.emit()
        return
      }
      this.clearProblem('lock_failed')
    } catch {
      this.problem(
        'lock_failed',
        'Could not refresh the edit lock beside the file. Others may not see that you are editing.'
      )
    }
    if (!c.saving && !c.conflict) {
      const d = await this.diskChanged(c)
      if (d.changed) await this.enterConflict(d.missing ? 'missing' : 'changed_on_disk')
    }
    this.emit()
  }

  private async readOnlyTick(c: Open): Promise<void> {
    const d = await this.diskChanged(c)
    if (d.changed && d.bytes) await this.replaceInMemory(d.bytes)
    if (
      c.readOnly &&
      (c.readOnly.reason === 'locked' ||
        c.readOnly.reason === 'stale_lock' ||
        c.readOnly.reason === 'lost_lock')
    ) {
      const lock = await readLock(this.d.fs, lockPathFor(c.path))
      const cls = classifyLock(lock, this.me.sessionId, this.d.now())
      c.readOnly = {
        ...c.readOnly,
        reason:
          cls === 'stale'
            ? 'stale_lock'
            : c.readOnly.reason === 'lost_lock'
              ? 'lost_lock'
              : 'locked',
        holder: lock.kind === 'ok' ? holderView(lock.info) : c.readOnly.holder,
        canTakeOver: cls === 'stale',
        canStartEditing: cls === 'free'
      }
    }
    this.emit()
  }

  // -------------------------------------------------------------- backups

  async listAllBackups(): Promise<BackupView[]> {
    const c = this.cur
    if (!c) return []
    const base = baseName(basename(c.path))
    const shared = await listBackups(this.d.fs, sharedBackupDir(c.path), base).catch(() => [])
    const local = await listBackups(this.d.fs, this.localBackupDir(), base).catch(() => [])
    const view =
      (source: BackupView['source']) =>
      (e: { name: string; at: Date; label: string | null; size: number }) => ({
        source,
        name: e.name,
        at: e.at.toISOString(),
        label: e.label,
        size: e.size
      })
    return [...shared.map(view('shared')), ...local.map(view('this_computer'))].sort((a, b) =>
      b.at.localeCompare(a.at)
    )
  }

  private backupPath(b: { source: BackupView['source']; name: string }): string {
    const c = this.cur
    if (!c) throw new Error('No file is open.')
    if (b.name.includes('/') || b.name.includes('\\') || b.name.startsWith('.'))
      throw new Error('Bad backup name.')
    return join(b.source === 'shared' ? sharedBackupDir(c.path) : this.localBackupDir(), b.name)
  }

  async previewBackup(b: {
    source: BackupView['source']
    name: string
  }): Promise<BackupPreview | { error: string }> {
    const c = this.cur
    if (!c) return { error: 'No file is open.' }
    const all = await this.listAllBackups()
    const entry = all.find((x) => x.source === b.source && x.name === b.name)
    if (!entry) return { error: 'That backup is no longer there.' }
    const r = await readDataFile(this.d.fs, this.backupPath(b))
    if (!r.ok) return { error: readProblemMessage(r.problem) }
    const old = await LockerDb.fromBytes(r.bytes).catch(() => null)
    if (!old) return { error: readProblemMessage('not_a_data_file') }
    const preview: BackupPreview = {
      backup: entry,
      backupSummary: summarise(old),
      currentSummary: summarise(c.db),
      undone: historyOnlyIn(c.db, old)
    }
    old.close()
    return preview
  }

  /**
   * Restores a backup as the current file. The current version is kept as a
   * named backup first (SPEC.md 4.12). The restore itself goes in the history.
   */
  async restoreBackup(b: { source: BackupView['source']; name: string }): Promise<OpenResult> {
    const c = this.cur
    if (!c) return { ok: false, message: 'No file is open.' }
    if (c.mode !== 'edit')
      return { ok: false, message: 'Only the person editing can restore a backup.' }
    const r = await readDataFile(this.d.fs, this.backupPath(b))
    if (!r.ok) return { ok: false, message: readProblemMessage(r.problem) }
    const candidate = await LockerDb.fromBytes(r.bytes).catch(() => null)
    if (!candidate || candidate.integrityProblems().length > 0) {
      candidate?.close()
      return { ok: false, message: 'That backup is damaged. Try another one.' }
    }
    const state = schemaState(candidate)
    candidate.close()
    if (state.kind === 'newer')
      return { ok: false, message: 'That backup was made by a newer version of the app.' }
    await this.flush()
    if (c.conflict) return { ok: false, message: 'Sort out the conflict first.' }
    await this.backupBytes(c.db.export(), `before restoring ${b.name.replace(/\.lockers$/i, '')}`)
    await this.replaceInMemory(r.bytes)
    // replaceInMemory reset the hash to the backup's; the disk still holds the current version.
    const disk = await readDataFile(this.d.fs, c.path)
    if (!disk.ok) return { ok: false, message: readProblemMessage(disk.problem) }
    c.hash = disk.hash
    this.write(
      { action: 'file.restored', entity: 'file', reason: `Restored backup ${b.name}` },
      () => undefined
    )
    await this.flush()
    return { ok: true }
  }

  // ---------------------------------------------------------------- close

  /**
   * Saves, releases the lock and closes. An unresolved conflict cannot be saved
   * over, so this computer's version is kept as a named backup instead.
   */
  async close(): Promise<void> {
    const c = this.cur
    if (!c) return
    this.stopTicking()
    try {
      if (c.conflict && c.conflict.reason !== 'copy' && c.dirty) {
        await this.backupBytes(c.db.export(), 'unsaved changes at close').catch(() => null)
      } else {
        await this.flush()
      }
      if (c.mode === 'edit') await releaseLock(this.lockDeps()).catch(() => undefined)
    } finally {
      if (this.saveTimer) this.timers.clearTimeout(this.saveTimer)
      this.saveTimer = null
      c.db.close()
      this.cur = null
      this.emit()
    }
  }
}

function holderView(info: LockInfo) {
  return {
    operator: info.operator,
    computer: info.computer,
    startedAt: info.startedAt,
    heartbeatAt: info.heartbeatAt
  }
}

function lowerFirst(s: string): string {
  return s.length > 0 ? s[0]!.toLowerCase() + s.slice(1) : s
}
