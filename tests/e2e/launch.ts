import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'

export interface Launched {
  app: ElectronApplication
  page: Page
  userData: string
  close: () => Promise<void>
}

/**
 * Starts the BUILT app with its own settings folder, so tests never touch the
 * real one and two copies can run side by side (each has its own single-instance
 * lock). operator: a name to pre-set, or null for a first run.
 */
export async function launchApp(
  opts: { operator?: string | null; userData?: string } = {}
): Promise<Launched> {
  const userData = opts.userData ?? mkdtempSync(join(tmpdir(), 'lockers-e2e-ud-'))
  const operator = opts.operator === undefined ? 'Test Operator' : opts.operator
  if (operator !== null) {
    mkdirSync(userData, { recursive: true })
    writeFileSync(
      join(userData, 'preferences.json'),
      JSON.stringify({ version: 1, operatorName: operator, recentFiles: [], ignoredCopies: {} })
    )
  }
  const app = await electron.launch({
    args: [resolve('.'), `--user-data-dir=${userData}`],
    env: { ...process.env, CI: '1' }
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return {
    app,
    page,
    userData,
    close: async () => {
      await app.close()
      if (!opts.userData) rmSync(userData, { recursive: true, force: true })
    }
  }
}

/** A folder to stand in for the school's shared folder. */
export function sharedFolder(): string {
  return mkdtempSync(join(tmpdir(), 'lockers-e2e-share-'))
}

/** Copies the SYNTHETIC demo-shaped fixture into place as a school's data file. */
export function placeFixture(folder: string, name = 'Locker data.lockers'): string {
  const path = join(folder, name)
  copyFileSync(resolve('tests/fixtures/schema/v1-SYNTHETIC.lockers'), path)
  return path
}

/** Makes the next native Open or Save dialog answer with this path. */
export async function answerNextDialog(
  app: ElectronApplication,
  kind: 'open' | 'save',
  path: string
): Promise<void> {
  await app.evaluate(
    ({ dialog }, { kind, path }) => {
      if (kind === 'open')
        dialog.showOpenDialog = (async () => ({
          canceled: false,
          filePaths: [path]
        })) as typeof dialog.showOpenDialog
      else
        dialog.showSaveDialog = (async () => ({
          canceled: false,
          filePath: path
        })) as typeof dialog.showSaveDialog
    },
    { kind, path }
  )
}
