import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp, type Launched } from './launch'

// Drives the BUILT app in out/ (run `npm run build` first).
const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version: string }

let l: Launched

test.beforeAll(async () => {
  l = await launchApp()
})

test.afterAll(async () => {
  await l.close()
})

test('the window opens on the Welcome screen', async () => {
  await expect(l.page).toHaveTitle('Locker Manager')
  await expect(l.page.getByRole('heading', { level: 1 })).toContainText('Every locker, every code')
  await expect(l.page.getByTestId('open-file')).toBeVisible()
})

test('the version from package.json is shown', async () => {
  await expect(l.page.getByTestId('version-line')).toContainText(`Version ${pkg.version}`)
})

test('About shows the version and the licence', async () => {
  await l.page.getByTestId('open-about').click()
  await expect(l.page.getByRole('dialog')).toBeVisible()
  await expect(l.page.getByTestId('about-version')).toHaveText(pkg.version)
  await expect(l.page.getByRole('dialog')).toContainText('MIT')
  await l.page.keyboard.press('Escape')
  await expect(l.page.getByRole('dialog')).toBeHidden()
})

test('the renderer has no Node access', async () => {
  const leaked = await l.page.evaluate(() => {
    const g = globalThis as unknown as Record<string, unknown>
    return typeof g['require'] !== 'undefined' || typeof g['process'] !== 'undefined'
  })
  expect(leaked).toBe(false)
})

test('a manual update check in a development build reports plainly', async () => {
  await l.page.getByTestId('open-about').click()
  await l.page.getByRole('button', { name: 'Check for updates' }).click()
  await l.page.keyboard.press('Escape')
  await expect(l.page.getByTestId('update-banner')).toContainText(
    'not available in a development build'
  )
})
