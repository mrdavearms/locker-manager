import { z } from 'zod'

// Storage settings (SPEC.md 7 item 13). The backup rules live in the data file, so
// every computer that opens it keeps backups the same way.

export const BackupRulesSchema = z.object({
  /** Every backup is kept for this many days. */
  keepAllDays: z.number().int().min(1).max(90),
  /** After that, one a day is kept until this many days old; then one a week. */
  dailyDays: z.number().int().min(7).max(730),
  /** The backups folder is kept under this size, in megabytes. */
  maxMb: z.number().int().min(50).max(5000)
})
export type BackupRules = z.infer<typeof BackupRulesSchema>

export const DEFAULT_BACKUP_RULES: BackupRules = { keepAllDays: 7, dailyDays: 92, maxMb: 500 }

export interface StorageView {
  path: string
  rules: BackupRules
  backups: { shared: number; thisComputer: number; sharedMb: number; thisComputerMb: number }
  heartbeatSeconds: number
  staleMinutes: number
}
