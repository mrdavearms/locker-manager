import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ManagedSchema, type Managed } from '@shared/computer'

// Managed settings for school IT (SPEC.md 9.5): one JSON file in a machine-wide
// folder that ordinary users cannot change. Every key is optional. A file that
// cannot be read is ignored and the reason shown in Settings, This computer.

export function managedPath(platform: NodeJS.Platform = process.platform): string {
  if (process.env.LOCKER_MANAGER_MANAGED) return process.env.LOCKER_MANAGER_MANAGED
  if (platform === 'win32')
    return join(process.env.ProgramData ?? 'C:\\ProgramData', 'Locker Manager', 'managed.json')
  if (platform === 'darwin') return '/Library/Application Support/Locker Manager/managed.json'
  return '/etc/locker-manager/managed.json'
}

export function parseManaged(text: string): { managed: Managed; problem: string | null } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { managed: {}, problem: 'managed.json is not valid JSON, so it was ignored.' }
  }
  const parsed = ManagedSchema.strict().safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return {
      managed: {},
      problem: `managed.json was ignored: ${first ? `${first.path.join('.') || 'file'} ${first.message.toLowerCase()}` : 'it is not in the expected form'}.`
    }
  }
  return { managed: parsed.data, problem: null }
}

let cached: { managed: Managed; problem: string | null } | null = null

export function readManaged(): { managed: Managed; problem: string | null } {
  if (cached) return cached
  const path = managedPath()
  try {
    cached = parseManaged(readFileSync(path, 'utf8'))
  } catch {
    cached = { managed: {}, problem: null }
  }
  return cached
}

/** For tests: forget the file read earlier. */
export function resetManagedCache(): void {
  cached = null
}
