import { execFile } from 'node:child_process'
import { hostname, userInfo } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { ComputerSettingsSchema } from '@shared/computer'
import { errorCode, nodeFs, type FsPort } from '../file/fsPort'

// Settings that belong to this computer, not to the school's data file:
// who is using it, recent files, and sync copies the operator has dismissed.

const RecentSchema = z.object({
  path: z.string(),
  openedAt: z.string(),
  schoolName: z.string().optional()
})

export const PrefsSchema = z.object({
  version: z.literal(1).default(1),
  operatorName: z.string().nullable().default(null),
  recentFiles: z.array(RecentSchema).default([]),
  ignoredCopies: z.record(z.string(), z.array(z.string())).default({}),
  computer: ComputerSettingsSchema.default(ComputerSettingsSchema.parse({})),
  /** Starts that did not reach a working window, for the recovery screen (SPEC.md 9.3). */
  failedStarts: z.number().int().min(0).default(0),
  lastStartedVersion: z.string().nullable().default(null),
  /** When this computer's person finished or skipped the welcome tour. */
  tourSeenAt: z.string().nullable().default(null),
  /** Data files whose getting-started list was hidden on this computer. */
  checklistHidden: z.array(z.string()).default([])
})
export type Prefs = z.infer<typeof PrefsSchema>

const MAX_RECENT = 8

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

  async update(fn: (p: Prefs) => Prefs): Promise<Prefs> {
    this.data = PrefsSchema.parse(fn(structuredClone(this.data)))
    await this.fs.mkdirp(this.folder)
    const tmp = `${this.path}.tmp-${process.pid}-${++this.seq}`
    await this.fs.writeNewFileDurable(
      tmp,
      new TextEncoder().encode(JSON.stringify(this.data, null, 2))
    )
    await this.fs.rename(tmp, this.path)
    return this.data
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
  const fallback = userInfo().username
  if (process.platform !== 'darwin') return Promise.resolve(fallback)
  return new Promise((resolve) => {
    execFile('/usr/bin/id', ['-F'], { timeout: 2000 }, (error, stdout) => {
      const full = stdout.trim()
      resolve(error || full.length === 0 ? fallback : full)
    })
  })
}
