import { expect, test } from '@playwright/test'
import { answerNextDialog, launchApp, placeFixture, sharedFolder } from './launch'

// Task 6: tick several locks on the reset list and mark them all in one go.

test('tick two locks to reset and mark them both at once', async () => {
  const share = sharedFolder()
  const l = await launchApp()
  await answerNextDialog(l.app, 'open', placeFixture(share))
  await l.page.getByTestId('open-file').click()

  await l.page.getByTestId('nav-lockers').click()
  await l.page.getByTestId('open-allocate').click()
  await l.page.getByTestId('make-draft').click()
  await expect(l.page.getByText(/students placed/)).toBeVisible()
  await l.page.getByTestId('commit-allocation').click()
  await expect(l.page.getByTestId('allocation-done')).toContainText('given out')

  for (const name of ['Anderson', 'Thompson']) {
    await l.page.getByTestId('nav-home').click()
    await l.page.getByTestId('task-student-has-left').click()
    await l.page.getByTestId('quick-find-input').fill(name)
    await l.page.getByRole('option').first().click()
    await l.page.getByTestId('confirm-left').click()
    await expect(l.page.getByText('No locker.', { exact: true })).toBeVisible()
  }

  await l.page.getByTestId('nav-home').click()
  const list = l.page.getByTestId('reset-list')
  await expect(list).toContainText('Locks to reset (2)')
  await list.getByRole('checkbox').nth(0).check()
  await list.getByRole('checkbox').nth(1).check()
  await list.getByRole('button', { name: 'Mark 2 as reset' }).click()
  await expect(l.page.getByTestId('message-strip')).toContainText('2 locks marked as reset')
  await expect(list).toHaveCount(0)
  await l.close()
})
