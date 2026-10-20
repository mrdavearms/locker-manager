import { readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { readLastMacResult } from '../../src/main/update/macInstaller'
import { removeTree, removeTreeSync } from '../../src/main/update/removeTree'
import { freshStagingDir } from '../../src/main/update/staging'

// Runs as a real Electron main process (bundled by updateFolder.test.ts), so the
// file functions here are Electron's patched ones that treat a .asar file as a
// folder. argv: <work folder> holding folders the test has planted. Prints one
// line, `REPORT <json>`, and quits. The test checks the disk itself afterwards.

async function outcome(task: () => Promise<unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    await task()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: (error as NodeJS.ErrnoException).code ?? String(error) }
  }
}

async function main(work: string): Promise<Record<string, unknown>> {
  const notes: string[] = []
  let staged = ''
  return {
    processType: process.type,
    control: await outcome(() => rm(join(work, 'control'), { recursive: true, force: true })),
    removeTree: await outcome(() => removeTree(join(work, 'async'))),
    removeTreeSync: await outcome(async () => removeTreeSync(join(work, 'sync'))),
    freshStagingDir: {
      ...(await outcome(async () => {
        staged = await freshStagingDir(join(work, 'staging'), removeTree, (m) => notes.push(m))
      })),
      staged,
      notes,
      rootHolds: await readdir(join(work, 'staging')).catch(() => [])
    },
    readLastMacResult: await readLastMacResult()
  }
}

const work = process.argv[process.argv.length - 1] ?? ''
main(work)
  .then(
    (report) => console.log(`REPORT ${JSON.stringify(report)}`),
    (error: unknown) => console.log(`REPORT ${JSON.stringify({ crashed: String(error) })}`)
  )
  .finally(() => app.exit(0))
