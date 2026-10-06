import { expect, test } from '@playwright/test'
import { answerNextDialog, launchApp, placeFixture, sharedFolder } from './launch'

// SPEC.md 4.4 and 4.5 end to end, on the SYNTHETIC WHS-shaped demo school:
// allocate, see a code (logged), a student leaves, the reset list, undo.

test('allocate the demo school, show a code, a student leaves, undo', async () => {
  const share = sharedFolder()
  const l = await launchApp()
  await answerNextDialog(l.app, 'open', placeFixture(share))
  await l.page.getByTestId('open-file').click()

  await l.page.getByTestId('nav-lockers').click()
  await l.page.getByTestId('open-allocate').click()
  await expect(l.page.getByLabel('Name').first()).toHaveValue('Year 7 side')
  await l.page.getByTestId('make-draft').click()
  await expect(l.page.getByText(/students placed/)).toBeVisible()
  await expect(l.page.getByTestId('unplaced')).toHaveCount(0)
  await l.page.getByTestId('commit-allocation').click()
  await expect(l.page.getByTestId('allocation-done')).toContainText('given out')
  await l.page.getByRole('button', { name: /See the lockers/ }).click()

  // Find the student in locker 1 and show their code.
  await l.page.getByTestId('open-find').click()
  await l.page.getByTestId('quick-find-input').fill('1')
  await l.page.getByRole('option').first().click()
  await expect(l.page.getByLabel('Locker 1', { exact: true })).toBeVisible()
  await l.page.getByTestId('show-code').click()
  await expect(l.page.getByTestId('code-shown')).toBeVisible()

  // A student has left: from Home, through quick find.
  await l.page.getByTestId('nav-home').click()
  await l.page.getByTestId('task-student-has-left').click()
  await l.page.getByTestId('quick-find-input').fill('Anderson')
  await l.page.getByRole('option').first().click()
  await l.page.getByTestId('confirm-left').click()
  await expect(l.page.getByText('No locker')).toBeVisible()
  await l.page.getByTestId('nav-home').click()
  await expect(l.page.getByTestId('reset-list')).toContainText('Locks to reset (1)')

  // Undo puts the student back in their locker.
  await l.page.getByTestId('nav-history').click()
  await expect(l.page.getByTestId('history-rows')).toContainText('Recorded a student leaving')
  await l.page.getByTestId('undo').click()
  await l.page.getByTestId('nav-home').click()
  await expect(l.page.getByTestId('reset-list')).toHaveCount(0)
  await l.close()
})
