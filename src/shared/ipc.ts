import { z } from 'zod'

// The one contract shared by main, preload and renderer. Every payload that
// crosses the bridge is validated with these schemas in the main process.

export { channels } from './channels'

export const AppInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  platform: z.enum(['darwin', 'win32', 'linux']),
  arch: z.string(),
  packaged: z.boolean(),
  /** True when the running app carries a Developer ID signature (macOS) or an Authenticode one (Windows). */
  signed: z.boolean(),
  electron: z.string(),
  chromium: z.string(),
  node: z.string(),
  licence: z.string(),
  repoUrl: z.string().url(),
  releasesUrl: z.string().url()
})
export type AppInfo = z.infer<typeof AppInfoSchema>

/** How this install receives updates. */
export const UpdateModeSchema = z.enum([
  /** Download in the background and install on restart (Windows, and macOS once signed). */
  'auto',
  /** Only tell the operator and open the download page (unsigned macOS). */
  'manual-download',
  /** Development build: no updates. */
  'disabled'
])
export type UpdateMode = z.infer<typeof UpdateModeSchema>

export const UpdateStatusSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('idle'), mode: UpdateModeSchema }),
  z.object({ state: z.literal('checking'), mode: UpdateModeSchema, manual: z.boolean() }),
  z.object({
    state: z.literal('up-to-date'),
    mode: UpdateModeSchema,
    version: z.string(),
    checkedAt: z.string()
  }),
  z.object({
    state: z.literal('available'),
    mode: UpdateModeSchema,
    version: z.string(),
    releaseNotes: z.string().optional(),
    releaseDate: z.string().optional(),
    downloadPageUrl: z.string().url()
  }),
  z.object({
    state: z.literal('downloading'),
    mode: UpdateModeSchema,
    version: z.string(),
    percent: z.number().min(0).max(100)
  }),
  z.object({
    state: z.literal('ready'),
    mode: UpdateModeSchema,
    version: z.string(),
    releaseNotes: z.string().optional()
  }),
  z.object({
    state: z.literal('error'),
    mode: UpdateModeSchema,
    message: z.string(),
    /** True when the operator asked for the check, so the error should be shown. */
    manual: z.boolean()
  })
])
export type UpdateStatus = z.infer<typeof UpdateStatusSchema>

export const OpenExternalSchema = z.object({ url: z.string().url() })

export const InstallResultSchema = z.object({
  started: z.boolean(),
  /** Plain-language reason when the install could not start now. */
  reason: z.string().optional()
})
export type InstallResult = z.infer<typeof InstallResultSchema>

// ------------------------------------------------------------ data file (M1)

export const OperatorSetSchema = z.object({ name: z.string().trim().min(1).max(80) })

export const OperatorInfoSchema = z.object({
  name: z.string().nullable(),
  suggested: z.string(),
  machine: z.string()
})
export type OperatorInfo = z.infer<typeof OperatorInfoSchema>

export const FilePathSchema = z.object({
  path: z
    .string()
    .min(1)
    .refine((p) => /\.lockers$/i.test(p), 'Not a Locker Manager data file.')
})

export const NewFileSchema = z.object({ schoolName: z.string().trim().min(1).max(120) })

export const ResolveConflictSchema = z.object({ choice: z.enum(['keep_mine', 'keep_theirs']) })

export const CopyNameSchema = z.object({
  name: z
    .string()
    .min(1)
    .refine((n) => !/[\\/]/.test(n) && /\.lockers$/i.test(n), 'Bad file name.')
})

export const ResolveCopySchema = CopyNameSchema.extend({
  choice: z.enum(['keep_current', 'use_copy', 'ignore'])
})

export const BackupRefSchema = z.object({
  source: z.enum(['shared', 'this_computer']),
  name: z
    .string()
    .min(1)
    .refine((n) => !/[\\/]/.test(n) && !n.startsWith('.'), 'Bad backup name.')
})

export const RenameSchoolSchema = z.object({ name: z.string().trim().min(1).max(120) })

export interface RecentFile {
  path: string
  fileName: string
  folder: string
  schoolName: string | null
  openedAt: string
  exists: boolean
}

/** Every file action answers with this: done, cancelled by the operator, or a plain message. */
export type ActionResult = { ok: true } | { ok: false; cancelled?: boolean; message: string }
