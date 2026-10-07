import { expect, test } from '@playwright/test'
import { answerNextDialog, launchApp, placeFixture, sharedFolder } from './launch'

test('New student who is not in the file yet: add them, then give a locker', async () => {
  const l = await launchApp()
  await answerNextDialog(l.app, 'open', placeFixture(sharedFolder()))
  await l.page.getByTestId('open-file').click()
  await l.page.getByTestId('task-new-student').click()
  await l.page.getByTestId('quick-find-input').fill('Zelda Newcomb')
  await l.page.getByRole('button', { name: /as a new student/ }).click()
  await l.page.getByLabel(/Student ID/i).fill('SYN9001')
  await l.page.getByLabel('First name').fill('Zelda')
  await l.page.getByLabel('Last name').fill('Newcomb')
  await l.page.getByRole('button', { name: 'Add student' }).click()
  await expect(l.page.getByTestId('message-strip')).toContainText('Zelda Newcomb added')
  await expect(l.page.getByTestId('confirm-assign')).toBeVisible()
  await l.close()
})
