import { mkdir, mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * An empty folder for one update download, inside `root`. Earlier downloads are
 * cleared first, but a leftover that will not delete never stops an update: the
 * new download goes into its own folder beside it, and `onLeftover` hears why.
 * (0.11.0 to 0.11.3 stopped every later update when the clear-out failed.)
 */
export async function freshStagingDir(
  root: string,
  remove: (path: string) => Promise<void>,
  onLeftover: (message: string) => void
): Promise<string> {
  try {
    await remove(root)
  } catch (error) {
    onLeftover(error instanceof Error ? error.message : String(error))
  }
  await mkdir(root, { recursive: true })
  return mkdtemp(join(root, 'download-'))
}
