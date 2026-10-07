import { expect, test } from '@playwright/test'
import { answerNextDialog, launchApp, placeFixture, sharedFolder } from './launch'

// Marking a locker out of service while a student holds it offers to move them.

test('out of service on a held locker opens the Move dialog for its student', async () => {
  const share = sharedFolder()
  const l = await launchApp()
  await answerNextDialog(l.app, 'open', placeFixture(share))
  await l.page.getByTestId('open-file').click()

  await l.page.getByTestId('nav-lockers').click()
  await l.page.getByTestId('open-allocate').click()
  await l.page.getByTestId('make-draft').click()
  await expect(l.page.getByTestId('unplaced')).toHaveCount(0)
  await l.page.getByTestId('commit-allocation').click()
  await expect(l.page.getByTestId('allocation-done')).toContainText('given out')
  await l.page.getByRole('button', { name: /See the lockers/ }).click()

  await l.page.getByRole('button', { name: /^Locker 1,/ }).click()
  await l.page.getByRole('button', { name: 'Out of service…' }).click()
  await l.page.getByLabel('Why?').fill('Door hinge broken')
  await expect(l.page.getByText(/this locker now/i)).toBeVisible()
  await l.page.getByRole('button', { name: /^Mark out of service and move / }).click()

  await expect(l.page.getByRole('dialog', { name: /^Move / })).toBeVisible()
  await l.close()
})
