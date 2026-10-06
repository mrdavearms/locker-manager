import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { answerNextDialog, launchApp, placeFixture, sharedFolder } from './launch'

// SPEC.md 4.1: a new school file leads straight into set-up, and lockers added
// there appear on the Lockers screen with their locks.

test('set up a school: an area, a bank, 114 lockers in 3 tiers', async () => {
  const share = sharedFolder()
  const l = await launchApp()
  await answerNextDialog(l.app, 'save', join(share, 'Locker data.lockers'))
  await l.page.getByTestId('new-file').click()
  await l.page.getByLabel('School name').fill('SYNTHETIC Setup College')
  await l.page.getByRole('button', { name: 'Choose where to save…' }).click()

  await expect(l.page.getByText('Set up your school')).toBeVisible()
  await l.page
    .getByRole('list', { name: 'Steps' })
    .getByRole('button', { name: /Lockers/ })
    .click()

  await l.page.getByTestId('add-area').click()
  await l.page.getByLabel('Name').fill('Year 7 side')
  await l.page.getByRole('button', { name: 'Save' }).click()
  await l.page.getByTestId('add-bank').click()
  await l.page.getByLabel('Name').fill('North wall')
  await l.page.getByRole('button', { name: 'Save' }).click()
  await l.page.getByTestId('add-lockers').click()
  await expect(l.page.getByText('114 lockers in 38 columns and 3 rows')).toBeVisible()
  await l.page.getByTestId('bulk-add-confirm').click()
  await expect(l.page.getByText('114 lockers in 38 columns × 3 high')).toBeVisible()

  await l.page.getByTestId('setup-next').click()
  await expect(l.page.getByText('Lock for each bank')).toBeVisible()
  await l.page.getByTestId('setup-next').click()
  await l.page.getByTestId('setup-finish').click()

  await expect(l.page.getByTestId('setup-card')).toHaveCount(0)
  await l.page.getByTestId('nav-lockers').click()
  await expect(l.page.getByRole('button', { name: /^Locker 114, spare$/ })).toBeVisible()
  await l.page.getByRole('button', { name: /^Locker 57, spare$/ }).click()
  await expect(l.page.getByLabel('Locker 57', { exact: true })).toContainText(
    'Built-in combination lock'
  )
  await expect(l.page.getByLabel('Locker 57', { exact: true })).toContainText('no code issued yet')
  await l.close()
})

test('the demo school shows both sides on the Lockers screen, and Renumber is a deliberate tool', async () => {
  const share = sharedFolder()
  const path = placeFixture(share)
  const l = await launchApp()
  await answerNextDialog(l.app, 'open', path)
  await l.page.getByTestId('open-file').click()
  await l.page.getByTestId('nav-lockers').click()
  await expect(l.page.getByRole('heading', { name: 'Year 7 side' })).toBeVisible()
  await expect(l.page.getByRole('heading', { name: 'Year 8 side' })).toBeVisible()
  await l.page.getByRole('button', { name: /^Locker 102, spare$/ }).click()
  await l.page.getByRole('button', { name: 'Renumber…' }).click()
  await l.page.getByLabel('New number').fill('113')
  await l.page.getByLabel('Why?').fill('Testing a clash')
  await l.page.getByRole('button', { name: 'Renumber', exact: true }).click()
  await expect(l.page.getByTestId('error-message')).toContainText('Locker 113 already exists')
  await l.close()
})
