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
  await expect(l.page.getByText('No locker.', { exact: true })).toBeVisible()
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

test('a line with its own order: Year 7 middle and bottom first, kept for next time', async () => {
  const share = sharedFolder()
  const l = await launchApp()
  await answerNextDialog(l.app, 'open', placeFixture(share))
  await l.page.getByTestId('open-file').click()

  await l.page.getByTestId('nav-lockers').click()
  await l.page.getByTestId('open-allocate').click()
  await l.page.getByRole('button', { name: 'Give Year 7 side its own order' }).click()
  await l.page.locator('#rule-0-lorder').selectOption('tier_preference')
  // The Year 8 line and the usual order are untouched.
  await expect(l.page.locator('#plan-lorder')).toHaveValue('number')
  await expect(l.page.getByRole('button', { name: 'Give Year 8 side its own order' })).toBeVisible()

  await l.page.getByTestId('make-draft').click()
  await expect(l.page.getByTestId('unplaced')).toHaveCount(0)
  // Bottom locker 114 is filled before top locker 112 (the demo has under 114 Year 7s).
  await expect(l.page.getByLabel(/^Locker 114: /)).not.toHaveAccessibleName('Locker 114: spare')
  await expect(l.page.getByLabel('Locker 112: spare', { exact: true })).toBeVisible()
  // Year 8 still fills by number from 115.
  await expect(l.page.getByLabel(/^Locker 115: /)).not.toHaveAccessibleName('Locker 115: spare')

  await l.page.getByTestId('commit-allocation').click()
  await expect(l.page.getByTestId('allocation-done')).toContainText('given out')

  // The line's own order is saved with the plan for next year.
  await l.page.getByTestId('nav-home').click()
  await l.page.getByTestId('nav-lockers').click()
  await l.page.getByTestId('open-allocate').click()
  await expect(l.page.locator('#rule-0-lorder')).toHaveValue('tier_preference')
  await l.close()
})
