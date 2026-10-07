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
  // The new code was recorded as shown, so it is shown, as with Move….
  const issued = l.page.getByTestId('issued-dialog')
  await expect(issued).toContainText('moved to')
  await issued.getByRole('button', { name: 'Done' }).click()
  await expect(issued).toHaveCount(0)
  await l.close()
})

// Undo in the message strip puts the stored values back, and the panel follows them.
test('Undo after changing a year level and group puts the panel back too', async () => {
  const l = await launchApp()
  await answerNextDialog(l.app, 'open', placeFixture(sharedFolder()))
  await l.page.getByTestId('open-file').click()

  await l.page.getByTestId('nav-students').click()
  await l.page.locator('tbody tr').first().click()
  const year = l.page.locator('#st-year')
  const group = l.page.locator('#st-group')
  const wasYear = await year.inputValue()
  const wasGroup = await group.inputValue()
  expect(wasYear).not.toBe('8')
  await year.selectOption('8')
  await group.selectOption('08A')
  await l.page.getByTestId('student-placement-save').click()
  await expect(l.page.getByTestId('message-strip')).toContainText('is now in')
  await expect(l.page.getByTestId('student-placement-save')).toHaveCount(0)

  await l.page.getByTestId('message-undo').click()
  await expect(l.page.getByTestId('message-strip')).toContainText('Undone')
  await expect(year).toHaveValue(wasYear)
  await expect(group).toHaveValue(wasGroup)
  await expect(l.page.getByTestId('student-placement-save')).toHaveCount(0)
  await l.close()
})
