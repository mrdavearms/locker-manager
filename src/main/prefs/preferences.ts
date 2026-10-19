import { execFile } from 'node:child_process'
import { hostname, userInfo } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { ComputerSettingsSchema } from '@shared/computer'
import { errorCode, nodeFs, sleep, type FsPort } from '../file/fsPort'

// Settings that belong to this computer, not to the school's data file:
// who is using it, recent files, and sync copies the operator has dismissed.

const RecentSchema = z.object({
  path: z.string(),
  openedAt: z.string(),
  schoolName: z.string().optional()
})

// Every field falls back to its default on its own: one unexpected value (a newer
// copy's version number, a hand edit) must never wipe the operator name and recent files.
export const PrefsSchema = z.object({
  version: z.number().int().default(1).catch(1),
  operatorName: z.string().nullable().default(null).catch(null),
  recentFiles: z.array(RecentSchema).default([]).catch([]),
  ignoredCopies: z.record(z.string(), z.array(z.string())).default({}).catch({}),
  computer: ComputerSettingsSchema.default(ComputerSettingsSchema.parse({})).catch(
    ComputerSettingsSchema.parse({})
  ),
  /** Starts that did not reach a working window, for the recovery screen (SPEC.md 9.3). */
  failedStarts: z.number().int().min(0).default(0).catch(0),
  lastStartedVersion: z.string().nullable().default(null).catch(null),
  /** When this computer's person finished or skipped the welcome tour. */
  tourSeenAt: z.string().nullable().default(null).catch(null),
  /** Data files whose getting-started list was hidden on this computer. */
  checklistHidden: z.array(z.string()).default([]).catch([]),
  /** The printer nudge last chosen for labels on this computer. */
  printerNudge: z.string().nullable().default(null).catch(null)
})
export type Prefs = z.infer<typeof PrefsSchema>

const MAX_RECENT = 8
const RETRYABLE = new Set(['EPERM', 'EBUSY', 'EACCES'])
const RENAME_ATTEMPTS = 10
const RENAME_DELAY_MS = 100

export class Preferences {
  private data: Prefs = PrefsSchema.parse({})
  private seq = 0

  constructor(
    private readonly folder: string,
    private readonly fs: FsPort = nodeFs
  ) {}

  private get path(): string {
    return join(this.folder, 'preferences.json')
  }

  async load(): Promise<Prefs> {
    try {
      // TextDecoder drops a byte-order mark, which Windows editors add.
      const text = new TextDecoder().decode(await this.fs.readFile(this.path))
      const parsed = PrefsSchema.safeParse(JSON.parse(text))
      this.data = parsed.success ? parsed.data : PrefsSchema.parse({})
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') this.data = PrefsSchema.parse({})
    }
    return this.data
  }

  get(): Prefs {
    return this.data
  }

  /**
   * Changes the preferences at once in memory, then writes them. Writes run one at a
   * time, so the file on disk always ends with the newest settings. A write that
   * fails is reported to the caller and never stops later writes.
   */
  update(fn: (p: Prefs) => Prefs): Promise<Prefs> {
    this.data = PrefsSchema.parse(fn(structuredClone(this.data)))
    const write = this.writing.then(() => this.write())
    this.writing = write.catch(() => undefined)
    return write
  }

  private writing: Promise<unknown> = Promise.resolve()

  private async write(): Promise<Prefs> {
    const data = this.data
    await this.fs.mkdirp(this.folder)
    const tmp = `${this.path}.tmp-${process.pid}-${++this.seq}`
    await this.fs.writeNewFileDurable(tmp, new TextEncoder().encode(JSON.stringify(data, null, 2)))
    // Windows antivirus or a backup tool can hold the file for a moment.
    for (let attempt = 1; ; attempt++) {
      try {
        await this.fs.rename(tmp, this.path)
        break
      } catch (error) {
        const code = errorCode(error)
        if (attempt >= RENAME_ATTEMPTS || !code || !RETRYABLE.has(code)) {
          await this.fs.unlink(tmp).catch(() => undefined)
          throw error
        }
        await sleep(RENAME_DELAY_MS)
      }
    }
    return data
  }

  async rememberRecent(path: string, schoolName: string, at: Date): Promise<void> {
    await this.update((p) => ({
      ...p,
      recentFiles: [
        { path, openedAt: at.toISOString(), schoolName },
        ...p.recentFiles.filter((r) => r.path !== path)
      ].slice(0, MAX_RECENT)
    }))
  }

  async forgetRecent(path: string): Promise<void> {
    await this.update((p) => ({ ...p, recentFiles: p.recentFiles.filter((r) => r.path !== path) }))
  }

  async ignoreCopy(dataPath: string, copyName: string): Promise<void> {
    await this.update((p) => ({
      ...p,
      ignoredCopies: {
        ...p.ignoredCopies,
        [dataPath]: [...new Set([...(p.ignoredCopies[dataPath] ?? []), copyName])]
      }
    }))
  }
}

/** This computer's name, as shown in "Being edited by Hannah on OFFICE-PC". */
export function machineName(): string {
  return hostname().replace(/\.local$/i, '')
}

/** A suggested operator name: the full name on a Mac, the login name elsewhere (SPEC.md 8.7). */
export function suggestedOperatorName(): Promise<string> {
  // userInfo() throws for an account with no entry in the system's user list
  // (some network logins); start-up must not stop for that.
  let fallback = 'Staff member'
  try {
    fallback = userInfo().username || fallback
  } catch {
    // keep the fallback
  }
  if (process.platform !== 'darwin') return Promise.resolve(fallback)
  return new Promise((resolve) => {
    execFile('/usr/bin/id', ['-F'], { timeout: 2000 }, (error, stdout) => {
      const full = stdout.trim()
      resolve(error || full.length === 0 ? fallback : full)
    })
  })
}
