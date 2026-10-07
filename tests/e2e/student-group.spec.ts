import { expect, test } from '@playwright/test'
import { answerNextDialog, launchApp, placeFixture, sharedFolder } from './launch'

// Changing a Year 7 student to Year 8 / 08A moves them off the Year 7 side, so the app
// offers the right side. Data is the SYNTHETIC demo school.
test('change a Year 7 student to Year 8 and take the offer to move their locker', async () => {
  const l = await launchApp()
  await answerNextDialog(l.app, 'open', placeFixture(sharedFolder()))
  await l.page.getByTestId('open-file').click()

  await l.page.getByTestId('nav-lockers').click()
  await l.page.getByTestId('open-allocate').click()
  await l.page.getByTestId('make-draft').click()
  await l.page.getByTestId('commit-allocation').click()
  await expect(l.page.getByTestId('allocation-done')).toContainText('given out')

  await l.page.getByTestId('nav-students').click()
  await l.page.locator('tbody tr').first().click()
  await l.page.locator('#st-year').selectOption('8')
  await l.page.locator('#st-group').selectOption('08A')
  await l.page.getByTestId('student-placement-save').click()

  const offer = l.page.getByTestId('move-offer')
  await expect(offer).toContainText(/Move .* to their new/)
  await l.page.getByTestId('move-offer-accept').click()
  await expect(l.page.getByTestId('message-strip')).toContainText('moved to')
  await l.close()
})
