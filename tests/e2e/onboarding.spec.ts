import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { answerNextDialog, launchApp, placeFixture, sharedFolder } from './launch'

// First-time help: the welcome tour shows once per computer and can be taken again,
// the getting-started list can be hidden and brought back, and the Guide opens at
// the help for the screen you are on. Every file used is SYNTHETIC.

test('the tour shows once per computer, and can be taken again from the Guide', async () => {
  const share = sharedFolder()
  const path = placeFixture(share)
  const l = await launchApp({ tour: true, userData: join(share, 'ud') })
  await answerNextDialog(l.app, 'open', path)
  await l.page.getByTestId('open-file').click()

  const tour = l.page.getByTestId('tour')
  await expect(tour).toBeVisible()
  await expect(tour).toContainText('Welcome to Locker Manager')
  await l.page.getByTestId('tour-next').click()
  await expect(tour).toContainText('Step 2 of 6')
  await l.page.getByTestId('tour-skip').click()
  await expect(tour).toBeHidden()
  const prefs = JSON.parse(readFileSync(join(share, 'ud', 'preferences.json'), 'utf8')) as {
    tourSeenAt: string | null
  }
  expect(prefs.tourSeenAt).not.toBeNull()

  // Not again: not on reopening the file, nor after restarting the app.
  await l.page.getByRole('button', { name: 'Close file' }).click()
  await answerNextDialog(l.app, 'open', path)
  await l.page.getByTestId('open-file').click()
  await expect(l.page.getByTestId('school-name')).toBeVisible()
  await expect(tour).toHaveCount(0)
  await l.close()

  const l2 = await launchApp({ userData: join(share, 'ud'), keepPrefs: true })
  await answerNextDialog(l2.app, 'open', path)
  await l2.page.getByTestId('open-file').click()
  await expect(l2.page.getByTestId('school-name')).toBeVisible()
  await expect(l2.page.getByTestId('tour')).toHaveCount(0)

  // Taken again on purpose from the Guide.
  await l2.page.getByTestId('open-help').click()
  await l2.page.getByTestId('help-tour').click()
  await expect(l2.page.getByTestId('tour')).toBeVisible()
  // Show me goes to that screen and closes the tour.
  await l2.page.getByTestId('tour-next').click()
  await l2.page.getByTestId('tour-next').click()
  await l2.page.getByTestId('tour-show-me').click()
  await expect(l2.page.getByTestId('tour')).toBeHidden()
  await expect(l2.page.getByTestId('nav-lockers')).toHaveAttribute('aria-current', 'page')
  await l2.close()
})

test('the getting-started list hides, comes back, and the Guide reopens set-up', async () => {
  const share = sharedFolder()
  const l = await launchApp()
  await answerNextDialog(l.app, 'save', join(share, 'Locker data.lockers'))
  await l.page.getByTestId('new-file').click()
  await l.page.getByLabel('School name').fill('SYNTHETIC Onboarding College')
  await l.page.getByRole('button', { name: 'Choose where to save…' }).click()
  await expect(l.page.getByText('Set up your school')).toBeVisible()
  await l.page.getByTestId('nav-home').click()

  const list = l.page.getByTestId('getting-started')
  await expect(list).toContainText('0 of 5 done')
  await expect(l.page.getByTestId('setup-card')).toBeVisible()
  await l.page.getByTestId('hide-getting-started').click()
  await expect(list).toHaveCount(0)

  // The Guide opens at Getting started from Home, and brings the list back.
  await l.page.getByTestId('open-help').click()
  await expect(l.page.getByRole('heading', { name: 'Getting started', level: 2 })).toBeVisible()
  await l.page.getByTestId('help-checklist').click()
  await expect(list).toBeVisible()

  // The Guide reopens the set-up steps.
  await l.page.getByTestId('open-help').click()
  await expect(l.page.getByTestId('help-checklist')).toHaveCount(0)
  await l.page.getByTestId('help-setup').click()
  await expect(l.page.getByRole('list', { name: 'Steps' })).toBeVisible()
  await l.close()
})

test('labels and letters can be set aside as not used, and brought back', async () => {
  const share = sharedFolder()
  const l = await launchApp()
  await answerNextDialog(l.app, 'save', join(share, 'Locker data.lockers'))
  await l.page.getByTestId('new-file').click()
  await l.page.getByLabel('School name').fill('SYNTHETIC Not Used College')
  await l.page.getByRole('button', { name: 'Choose where to save…' }).click()
  await expect(l.page.getByText('Set up your school')).toBeVisible()
  await l.page.getByTestId('nav-home').click()

  const list = l.page.getByTestId('getting-started')
  await expect(list).toContainText('0 of 5 done')
  await l.page.getByTestId('not-used-labels').click()
  await expect(list).toContainText('1 of 5 done')
  await l.page.getByTestId('not-used-letters').click()
  await expect(list).toContainText('2 of 5 done')
  await expect(l.page.getByTestId('getting-started-labels')).toContainText('Not used')
  await expect(l.page.getByTestId('getting-started-letters')).toContainText('Not used')
  await expect(l.page.getByTestId('start-labels')).toHaveCount(0)

  await l.page.getByTestId('use-after-all-labels').click()
  await expect(list).toContainText('1 of 5 done')
  await expect(l.page.getByTestId('start-labels')).toBeVisible()
  await l.page.getByTestId('use-after-all-letters').click()
  await expect(list).toContainText('0 of 5 done')
  await l.close()
})

test('the Guide opens at the help for the screen you are on', async () => {
  const share = sharedFolder()
  const l = await launchApp()
  await answerNextDialog(l.app, 'open', placeFixture(share))
  await l.page.getByTestId('open-file').click()
  await l.page.getByTestId('nav-print').click()
  await l.page.getByTestId('open-help').click()
  await expect(l.page.locator('#help-title')).toHaveText('Print locker labels')
  await l.page.getByTestId('help-close').click()
  await l.page.getByTestId('nav-history').click()
  await l.page.getByTestId('open-help').click()
  await expect(l.page.locator('#help-title')).toHaveText('Undo a mistake')
  await l.close()
})
