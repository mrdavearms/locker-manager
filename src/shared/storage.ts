import { z } from 'zod'

// Storage settings (SPEC.md 7 item 13). The backup rules live in the data file, so
// every computer that opens it keeps backups the same way.

export const BackupRulesSchema = z.object({
  /** Every backup is kept for this many days. */
  keepAllDays: z.number().int().min(1).max(90),
  /**
   * After that, one an hour is kept until this many days old. Added after 0.11.0: rules
   * saved by an older version have none, which means no hourly stage (see
   * fullBackupRules). An older version ignores it when it reads the file.
   */
  hourlyDays: z.number().int().min(1).max(90).optional(),
  /** After that, one a day is kept until this many days old; then one a week. */
  dailyDays: z.number().int().min(7).max(730),
  /** The backups folder is kept under this size, in megabytes. */
  maxMb: z.number().int().min(50).max(5000)
})
export type BackupRules = z.infer<typeof BackupRulesSchema>
export type FullBackupRules = Omit<BackupRules, 'hourlyDays'> & { hourlyDays: number }

export const DEFAULT_BACKUP_RULES: FullBackupRules = {
  keepAllDays: 1,
  hourlyDays: 7,
  dailyDays: 99,
  maxMb: 500
}

/** The rules with every stage filled in: rules from 0.11.0 and earlier had no hourly stage. */
export function fullBackupRules(r: BackupRules): FullBackupRules {
  return { ...r, hourlyDays: r.hourlyDays ?? r.keepAllDays }
}

/** How far back one backups folder really reaches (Settings, Storage). */
export interface BackupReachView {
  /** The oldest backup taken on save (not a named one), as an ISO time; null if none. */
  oldest: string | null
  /** How many days back the rules promise. */
  promisedDays: number
  /** True when the size limit is cutting backups off before the promised days. */
  short: boolean
  /** True when the folder is at its size limit, so backups are spread out to fit. */
  full: boolean
}

export interface StorageView {
  path: string
  rules: FullBackupRules
  backups: { shared: number; thisComputer: number; sharedMb: number; thisComputerMb: number }
  reach: { shared: BackupReachView; thisComputer: BackupReachView }
  heartbeatSeconds: number
  staleMinutes: number
}
