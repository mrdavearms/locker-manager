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

test('a message clears with Close, the newest replaces the last, and sits above the status bar', async () => {
  const l = await launchApp()
  await answerNextDialog(l.app, 'open', placeFixture(sharedFolder()))
  await l.page.getByTestId('open-file').click()
  await l.page.getByTestId('nav-lockers').click()
  await l.page
    .getByLabel(/^Locker 1(,|$)/)
    .first()
    .click()
  await l.page.getByRole('button', { name: 'Reserve' }).click()
  const strip = l.page.getByTestId('message-strip')
  await expect(strip).toContainText('reserved')

  const s = await strip.boundingBox()
  const bar = await l.page.getByTestId('status-bar').boundingBox()
  expect(s && bar && s.y + s.height <= bar.y).toBe(true)

  await l.page.getByRole('button', { name: 'Back in service' }).click()
  await expect(strip).toContainText('back in service')
  await expect(strip).not.toContainText('reserved')

  await l.page.getByRole('button', { name: 'Close message' }).click()
  await expect(strip).toHaveCount(0)

  await l.page.getByRole('button', { name: 'Reserve' }).click()
  await expect(strip).toContainText('reserved')
  await l.page.getByRole('button', { name: 'Close file' }).click()
  await expect(strip).toHaveCount(0)
  await l.close()
})
