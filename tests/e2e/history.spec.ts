import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import initSqlJs from 'sql.js'
import { answerNextDialog, launchApp, placeFixture, sharedFolder } from './launch'

// SPEC.md 4.12: "restore this record to how it was", from the backup kept on save.

test('a locker is put back to how it was before a change', async () => {
  const l = await launchApp()
  await l.page.setViewportSize({ width: 1300, height: 950 })
  await answerNextDialog(l.app, 'open', placeFixture(sharedFolder()))
  await l.page.getByTestId('open-file').click()
  await l.page.getByTestId('open-find').click()
  await l.page.getByTestId('quick-find-input').fill('5')
  await l.page.getByRole('option').first().click()
  const accessible = l.page.getByRole('checkbox', { name: /Accessible/ })
  const was = await accessible.isChecked()
  await accessible.click()
  await expect(accessible).toBeChecked({ checked: !was })
  // Wait for the save, which keeps a backup of the file from before the change.
  await expect(l.page.getByText(/^Saved /)).toBeVisible({ timeout: 15_000 })

  await l.page.getByTestId('nav-history').click()
  await l.page.getByRole('button', { name: 'Put back to before this…' }).first().click()
  await expect(l.page.getByTestId('restore-record')).toContainText('Accessible')
  await l.page.getByTestId('restore-record-apply').click()
  await expect(l.page.getByTestId('history-rows')).toContainText('Put a record back to how it was')

  await l.page.getByTestId('open-find').click()
  await l.page.getByTestId('quick-find-input').fill('5')
  await l.page.getByRole('option').first().click()
  await expect(l.page.getByRole('checkbox', { name: /Accessible/ })).toBeChecked({ checked: was })
  await l.close()
})

test('a label QR link opens its locker (SPEC.md 5.6)', async () => {
  const l = await launchApp()
  await l.page.setViewportSize({ width: 1300, height: 950 })
  const path = placeFixture(sharedFolder())
  const SQL = await initSqlJs()
  const db = new SQL.Database(readFileSync(path))
  const qrId = String(db.exec("SELECT qr_id FROM locker WHERE number = '7'")[0]!.values[0]![0])
  db.close()
  await answerNextDialog(l.app, 'open', path)
  await l.page.getByTestId('open-file').click()
  await expect(l.page.getByTestId('nav-home')).toBeVisible()
  await l.app.evaluate(({ app }, url) => {
    app.emit('open-url', { preventDefault: () => undefined }, url)
  }, `lockermanager://locker/${qrId}`)
  await expect(l.page.getByLabel('Locker 7', { exact: true })).toBeVisible()
  await l.close()
})

test('the guide’s Show me opens the right Settings tab', async () => {
  const l = await launchApp()
  await l.page.setViewportSize({ width: 1300, height: 950 })
  await answerNextDialog(l.app, 'open', placeFixture(sharedFolder()))
  await l.page.getByTestId('open-file').click()
  for (const [section, tab] of [
    ['Protect codes with a PIN', 'Privacy'],
    ['Change how long backups are kept', 'Storage'],
    ['Text size, dark mode and high contrast', 'This computer'],
    ['Lock codes and their rules', 'Lock codes']
  ] as const) {
    await l.page.getByTestId('open-help').click()
    await l.page
      .getByRole('navigation', { name: 'Guide sections' })
      .getByRole('button', { name: section, exact: true })
      .click()
    await l.page.getByTestId('help-show-me').click()
    await expect(l.page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true')
  }
  await l.close()
})
