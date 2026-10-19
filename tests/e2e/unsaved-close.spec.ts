import { chmodSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { answerNextDialog, launchApp, placeFixture, sharedFolder } from './launch'

// docs/audits/2026-10-20-stability-audit.md, finding 6: a save that kept failing,
// then Quit or Restart to update, lost the changes with a warning nobody saw.
// The shared folder is made read-only to make every save fail; Windows ignores
// that permission on folders, so this runs on Mac and Linux only.
test.skip(process.platform === 'win32', 'folder permissions do not stop writes on Windows')

test('closing with changes that cannot be saved asks first, and Close anyway keeps them as a backup', async () => {
  const share = sharedFolder()
  const path = placeFixture(share)
  const l = await launchApp()
  try {
    await answerNextDialog(l.app, 'open', path)
    await l.page.getByTestId('open-file').click()
    await expect(l.page.getByTestId('mode-pill')).toHaveText('Editing')

    chmodSync(share, 0o555)
    await l.page.getByTestId('rename-school').click()
    await l.page.getByLabel('School name').fill('SYNTHETIC Unsaved College')
    await l.page.getByRole('button', { name: 'Save' }).click()
    await expect(l.page.getByTestId('save-status')).toHaveText('Unsaved changes', {
      timeout: 15_000
    })

    // Answer the native question with Cancel, and count how often it is asked.
    await l.app.evaluate(({ dialog }) => {
      const g = globalThis as unknown as { asked: string[]; answer: number }
      g.asked = []
      g.answer = 2
      dialog.showMessageBox = (async (...args: unknown[]) => {
        const opts = (args.length > 1 ? args[1] : args[0]) as { message: string }
        g.asked.push(opts.message)
        return { response: g.answer, checkboxChecked: false }
      }) as typeof dialog.showMessageBox
    })
    const asked = () => l.app.evaluate(() => (globalThis as unknown as { asked: string[] }).asked)

    await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
    await expect.poll(asked, { timeout: 15_000 }).toHaveLength(1)
    expect((await asked())[0]).toMatch(/not been saved/)
    // Cancel: the window and the changes are still there.
    await expect(l.page.getByTestId('school-name')).toHaveText('SYNTHETIC Unsaved College')

    // Close anyway: the changes go to this computer's backups, and the person is told.
    await l.app.evaluate(() => {
      ;(globalThis as unknown as { answer: number }).answer = 1
    })
    await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
    await expect.poll(asked, { timeout: 30_000 }).toHaveLength(3)
    expect((await asked())[2]).toMatch(/were not saved/)
    const local = join(l.userData, 'backups')
    const kept = readdirSync(local, { recursive: true }).map(String)
    expect(kept.some((f) => f.includes('unsaved changes at close'))).toBe(true)
  } finally {
    chmodSync(share, 0o755)
    await l.close().catch(() => undefined)
  }
})
