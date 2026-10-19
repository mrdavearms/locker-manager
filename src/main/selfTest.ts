import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import log from 'electron-log/main'
import { brand } from '@shared/brand'
import { createDemoDatabase } from './demo/demoSchool'
import { loadSqlJs } from './db/db'

// `Locker Manager --self-test`: checks that an installed copy can do its work, then
// quits with 0 (passed) or 1. The release workflow runs it on every build before
// publishing, and the update proofs run it after updating. A log line written early
// in start-up proved little: a copy whose database engine or window could not load
// inside the package still wrote it (docs/audits/2026-10-20-stability-audit.md, 4).
// No window opens, no file is touched and the updater does not start.

export const SELF_TEST_FLAG = '--self-test'

export async function runSelfTest(): Promise<number> {
  const checks: Array<[string, () => Promise<void> | void]> = [
    ['database engine', async () => void (await loadSqlJs())],
    [
      'demo school',
      async () => {
        const db = await createDemoDatabase(
          { operator: 'Self-test', machine: 'SELF-TEST', now: () => new Date() },
          app.getVersion()
        )
        try {
          const problems = db.integrityProblems()
          if (problems.length > 0) throw new Error(problems[0])
          db.export()
        } finally {
          db.close()
        }
      }
    ],
    [
      'window files',
      () => {
        for (const file of ['../renderer/index.html', '../preload/index.cjs'])
          if (!existsSync(join(__dirname, file))) throw new Error(`${file} is missing`)
      }
    ],
    [
      'fonts',
      () => {
        if (!app.isPackaged) return
        if (!existsSync(join(process.resourcesPath, 'fonts')))
          throw new Error('the fonts folder is missing')
      }
    ]
  ]
  let failed = 0
  for (const [name, check] of checks) {
    try {
      await check()
      log.info(`self-test: ${name} ok`)
    } catch (error) {
      failed++
      log.error(`self-test: ${name} FAILED`, error instanceof Error ? error.message : error)
    }
  }
  // Written out in full: the update proofs look for "self-test passed" in the package
  // to know a copy has the self-test.
  if (failed === 0) log.info(`${brand.name} ${app.getVersion()} self-test passed`)
  else log.error(`${brand.name} ${app.getVersion()} self-test failed`)
  return failed === 0 ? 0 : 1
}
