import { expect, test } from '@playwright/test'
import { launchApp } from './launch'

// docs/audits/2026-10-20-stability-audit.md, finding 3: an error during start-up
// used to leave a copy running with no window, holding the single-instance lock.
test('a start-up error shows the recovery page, and closing it ends the app', async () => {
  const { app, page, close } = await launchApp({ env: { LOCKER_MANAGER_FAIL_START: '1' } })
  await expect(page.locator('h1')).toContainText('did not start properly')
  await expect(page.locator('body')).toContainText('a start-up test failure')
  const ended = new Promise<void>((resolve) => app.process().once('exit', () => resolve()))
  await page.close()
  await ended
  await close().catch(() => undefined)
})

// Start-up finding F3: a crashed window used to stay blank. Playwright's page dies
// with the window's process, so the check runs from the main process.
test('a window whose code crashes reloads by itself', async () => {
  const { app, page, close } = await launchApp()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.forcefullyCrashRenderer()
  })
  await expect
    .poll(
      () =>
        app.evaluate(async ({ BrowserWindow }) => {
          const wc = BrowserWindow.getAllWindows()[0]?.webContents
          if (!wc || wc.isCrashed() || wc.isLoading()) return null
          return (await wc.executeJavaScript(
            'document.querySelector("h1")?.textContent ?? null'
          )) as string | null
        }),
      { timeout: 20_000 }
    )
    .toContain('Every locker, every code')
  await close()
})
