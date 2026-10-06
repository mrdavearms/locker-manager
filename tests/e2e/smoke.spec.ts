import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page
} from '@playwright/test'

// Drives the BUILT app in out/ (run `npm run build` first).
const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version: string }

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  // Launch the project folder (not the built file) so Electron reads package.json
  // and app.getVersion() is ours rather than Electron's own.
  app = await electron.launch({
    args: [resolve('.')],
    env: { ...process.env, CI: '1' }
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await app.close()
})

test('the window opens with the app name', async () => {
  await expect(page).toHaveTitle('Locker Manager')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Locker Manager')
})

test('the Home screen shows the version from package.json', async () => {
  await expect(page.getByTestId('version-line')).toContainText(`Version ${pkg.version}`)
})

test('About shows the version and the licence', async () => {
  await page.getByTestId('open-about').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByTestId('about-version')).toHaveText(pkg.version)
  await expect(page.getByRole('dialog')).toContainText('MIT')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('the renderer has no Node access', async () => {
  const leaked = await page.evaluate(() => {
    const g = globalThis as unknown as Record<string, unknown>
    return typeof g['require'] !== 'undefined' || typeof g['process'] !== 'undefined'
  })
  expect(leaked).toBe(false)
})

test('a manual update check in a development build reports plainly', async () => {
  await page.getByTestId('open-about').click()
  await page.getByRole('button', { name: 'Check for updates' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('update-banner')).toContainText(
    'not available in a development build'
  )
})
