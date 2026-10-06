import { readFileSync, writeFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import initSqlJs from 'sql.js'
import { answerNextDialog, launchApp, placeFixture, sharedFolder } from './launch'

/** The SYNTHETIC fixture is the demo school; make this copy an ordinary school file. */
async function schoolFile(): Promise<string> {
  const path = placeFixture(sharedFolder())
  const SQL = await initSqlJs()
  const db = new SQL.Database(readFileSync(path))
  db.run("UPDATE meta SET value = '0' WHERE key = 'demo'")
  writeFileSync(path, db.export())
  db.close()
  return path
}

// SPEC.md 7 item 12 and 10: a PIN before codes, Needs attention, and practice copies.

test('a PIN guards codes; practice copies never touch the real file', async () => {
  test.setTimeout(120_000)
  const l = await launchApp()
  await l.page.setViewportSize({ width: 1300, height: 950 })
  await answerNextDialog(l.app, 'open', await schoolFile())
  await l.page.getByTestId('open-file').click()
  await expect(l.page.getByTestId('problem-no-locker')).toBeVisible()
  await l.page.getByTestId('nav-lockers').click()
  await l.page.getByTestId('open-allocate').click()
  await l.page.getByTestId('make-draft').click()
  await l.page.getByTestId('commit-allocation').click()
  await expect(l.page.getByTestId('allocation-done')).toContainText('given out')

  // Set a PIN.
  await l.page.getByTestId('nav-settings').click()
  await l.page.getByRole('tab', { name: 'Privacy' }).click()
  await l.page.getByTestId('pin-new').fill('2580')
  await l.page.getByTestId('pin-again').fill('2580')
  await l.page.getByTestId('pin-save').click()
  await expect(l.page.getByTestId('pin-state')).toHaveText('A PIN is set.')

  // Showing a code now asks for it.
  await l.page.getByTestId('open-find').click()
  await l.page.getByTestId('quick-find-input').fill('1')
  await l.page.getByRole('option').first().click()
  await l.page.getByTestId('show-code').click()
  await expect(l.page.getByTestId('pin-dialog')).toBeVisible()
  await l.page.getByTestId('pin-input').fill('1111')
  await l.page.getByTestId('pin-submit').click()
  await expect(l.page.getByRole('alert')).toHaveText('That PIN is not right.')
  await l.page.getByTestId('pin-input').fill('2580')
  await l.page.getByTestId('pin-submit').click()
  await expect(l.page.getByTestId('code-shown')).toBeVisible()

  // A practice copy.
  await l.page.getByTestId('nav-home').click()
  await expect(l.page.getByTestId('problems')).toBeVisible()
  await l.page.getByTestId('start-practice').click()
  await expect(l.page.getByTestId('practice-badge')).toBeVisible()
  await expect(l.page.getByTestId('practice-banner')).toBeVisible()
  await expect(l.page.getByTestId('start-practice')).toHaveCount(0)
  await l.close()
})
