import { expect, test } from '@playwright/test'
import { answerNextDialog, launchApp, placeFixture, sharedFolder } from './launch'

test('a change says what it did, and Undo in the message puts it back', async () => {
  const l = await launchApp()
  await answerNextDialog(l.app, 'open', placeFixture(sharedFolder()))
  await l.page.getByTestId('open-file').click()
  await l.page.getByTestId('nav-lockers').click()
  await l.page
    .getByLabel(/^Locker 1(,|$)/)
    .first()
    .click()
  await l.page.getByRole('button', { name: 'Reserve' }).click()
  await expect(l.page.getByTestId('message-strip')).toContainText('reserved')
  await l.page.getByTestId('message-undo').click()
  await expect(l.page.getByTestId('message-strip')).toContainText('Undone')
  await expect(l.page.getByRole('button', { name: 'Reserve' })).toBeVisible()
  await l.close()
})
