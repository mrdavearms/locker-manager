import { z } from 'zod'

// Settings that belong to one computer (SPEC.md 7, items 14 and 15), and the
// managed settings school IT can fix for every user (SPEC.md 9.5).

export const TEXT_SIZES = [100, 115, 130, 150, 175, 200] as const

export const ComputerSettingsSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']).default('system'),
  textSize: z
    .union([
      z.literal(100),
      z.literal(115),
      z.literal(130),
      z.literal(150),
      z.literal(175),
      z.literal(200)
    ])
    .default(100),
  contrast: z.enum(['normal', 'high']).default('normal'),
  /** Download and install updates by themselves (Windows, and signed Macs). */
  autoUpdate: z.boolean().default(true),
  channel: z.enum(['stable', 'beta']).default('stable')
})
export type ComputerSettings = z.infer<typeof ComputerSettingsSchema>

/** managed.json: every key is optional; a key that is present is locked for users. */
export const ManagedSchema = z
  .object({
    autoUpdate: z.boolean(),
    updateChannel: z.enum(['stable', 'beta']),
    defaultDataFile: z.string().min(1).max(1000),
    demoEnabled: z.boolean(),
    requirePinForCodes: z.boolean()
  })
  .partial()
export type Managed = z.infer<typeof ManagedSchema>

export interface ComputerView {
  /** What applies, after managed settings. */
  settings: ComputerSettings
  managed: Managed
  managedPath: string
  /** A managed.json that could not be read, in plain words. */
  managedProblem: string | null
}
