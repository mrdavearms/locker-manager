import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { answerNextDialog, launchApp, sharedFolder } from './launch'

// SPEC.md 4.5: a fixed-code padlock's code comes with it. Staff type in its code and
// serial, from the student's panel (New code) or the Lockers screen. SYNTHETIC school.

test('fixed-code padlocks: record the code from the panel and the Lockers screen', async () => {
  const share = sharedFolder()
  const l = await launchApp()
  const p = l.page
  await answerNextDialog(l.app, 'save', join(share, 'Locker data.lockers'))
  await p.getByTestId('new-file').click()
  await p.getByLabel('School name').fill('SYNTHETIC Padlock Primary')
  await p.getByRole('button', { name: 'Choose where to save…' }).click()
  await expect(p.getByText('Set up your school')).toBeVisible({ timeout: 20_000 })

  await p
    .getByRole('list', { name: 'Steps' })
    .getByRole('button', { name: /Lockers/ })
    .click()
  await p.getByLabel('How many lockers?').fill('3')
  await p.getByLabel('Kind of lock').selectOption({ label: 'Combination padlock (fixed code)' })
  await p.getByTestId('quick-start-add').click()
  await expect(p.getByTestId('quick-start-add')).toHaveCount(0)
  for (const text of ['Lock for each bank', 'Lock code rules', 'How letters work']) {
    await p.getByTestId('setup-next').click()
    await expect(p.getByText(text).first()).toBeVisible()
  }
  await p.getByTestId('setup-next').click()
  await p.getByTestId('setup-next').click()
  await p.getByTestId('setup-finish').click()

  // One student by hand, given a locker.
  await p.getByTestId('nav-students').click()
  await p.getByTestId('add-student-open').click()
  await p.locator('#add-st-id').fill('SYNTHETIC1')
  await p.locator('#add-st-first').fill('Ava')
  await p.locator('#add-st-last').fill('Syntheticone')
  await p.locator('#add-st-year').selectOption('__other')
  await p.getByRole('dialog').getByLabel('Other year level').fill('5')
  await p.getByTestId('add-student-save').click()
  await expect(p.getByTestId('message-strip')).toContainText('Ava Syntheticone added')
  await p.getByTestId('student-search').fill('Ava')
  await p.getByRole('button', { name: /Syntheticone, Ava/ }).click()
  await p.getByTestId('give-locker').click()
  await p.getByTestId('confirm-assign').click()
  await p.getByRole('button', { name: 'Done' }).click()

  // New code on a fixed padlock asks for the new padlock, not a reason.
  await p.getByRole('button', { name: /New code/ }).click()
  const dialog = p.getByTestId('record-padlock')
  // Ava's padlock has no code recorded yet.
  await expect(dialog).toContainText('from its tag or box')
  await dialog.getByLabel('Code').fill('12')
  await dialog.getByLabel('Serial (optional)').fill('SN-0001')
  await p.getByTestId('confirm-record-padlock').click()
  // A code of the wrong length is refused and the dialog stays open.
  await expect(p.getByTestId('error-message')).toContainText(/numbers from 0/)
  await p.getByTestId('error-dialog').getByRole('button', { name: 'OK' }).click()
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Code').fill('1234')
  await p.getByTestId('confirm-record-padlock').click()
  await expect(p.getByTestId('message-strip')).toContainText('New padlock recorded')
  await p.getByTestId('show-code').click()
  await expect(p.getByTestId('code-shown')).toContainText('1')
  await expect(p.getByLabel('Code 1 2 3 4')).toBeVisible()
  // Now it has one, New code means a different padlock.
  await p.getByRole('button', { name: /New code/ }).click()
  await expect(dialog).toContainText('Put a different padlock on')
  await dialog.getByRole('button', { name: 'Cancel' }).click()

  // The Lockers screen: a spare fixed padlock with no code yet offers Record its code.
  await p.getByTestId('nav-lockers').click()
  await p
    .getByRole('button', { name: /^Locker \S+, spare$/ })
    .first()
    .click()
  await p.getByTestId('record-padlock-open').click()
  await expect(p.getByTestId('record-padlock')).toContainText('from its tag or box')
  await p.getByTestId('record-padlock').getByLabel('Code').fill('5678')
  await p.getByTestId('confirm-record-padlock').click()
  await expect(p.getByTestId('message-strip')).toContainText('New padlock recorded')
  await expect(p.getByTestId('record-padlock-open')).toHaveText(/Record a new padlock/)
  await l.close()
})
