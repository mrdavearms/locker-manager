import { expect, test } from '@playwright/test'
import { answerNextDialog, launchApp, placeFixture, sharedFolder } from './launch'

// SPEC.md 4.10 end to end on the SYNTHETIC demo school: students reset their own
// locks, the year is archived with a typed confirmation and a named backup, new
// codes are made, and lockers are given out again.

test('start next year: self-reset, archive, codes, allocate again', async () => {
  test.setTimeout(120_000)
  const share = sharedFolder()
  const l = await launchApp()
  await l.page.setViewportSize({ width: 1400, height: 1100 })
  await answerNextDialog(l.app, 'open', placeFixture(share))
  await l.page.getByTestId('open-file').click()
  await l.page.getByTestId('nav-lockers').click()
  await l.page.getByTestId('open-allocate').click()
  await l.page.getByTestId('make-draft').click()
  await l.page.getByTestId('commit-allocation').click()
  await expect(l.page.getByTestId('allocation-done')).toContainText('given out')

  await l.page.getByTestId('nav-home').click()
  await l.page.getByTestId('task-start-next-year').click()
  await l.page.getByTestId('rollover-start').click()
  await l.page.getByTestId('rollover-next').click()
  // Homeroom 7A reset their own locks on the last day.
  await l.page.getByTestId('self-reset-07A').click()
  await expect(l.page.getByTestId('self-reset-07A')).toHaveCount(0)
  await l.page.getByTestId('rollover-next').click()
  await l.page.getByTestId('rollover-next').click()

  const year = new Date().getFullYear()
  await expect(l.page.getByTestId('rollover-archive')).toBeDisabled()
  await l.page.getByTestId('rollover-confirm').fill(`start ${year + 1}`)
  await l.page.getByTestId('rollover-archive').click()
  await expect(l.page.getByText(`${year + 1} has started.`).first()).toBeVisible()

  // The backup was kept by name.
  await l.page.getByRole('button', { name: 'Backups' }).click()
  await expect(l.page.getByText(`Before starting ${year + 1}`).first()).toBeVisible()
  await l.page.keyboard.press('Escape')

  // New codes, then allocate again.
  await l.page.getByRole('button', { name: /Codes for next year/ }).click()
  await l.page.getByTestId('rollover-codes').click()
  await expect(l.page.getByText(`A code set for ${year + 1} is ready.`)).toBeVisible()
  await l.page.getByRole('button', { name: /Give out lockers/ }).click()
  await l.page.getByRole('button', { name: /Allocate lockers/ }).click()
  await l.page.getByTestId('make-draft').click()
  await l.page.getByTestId('commit-allocation').click()
  await expect(l.page.getByTestId('allocation-done')).toContainText('given out')

  // History shows the rollover.
  await l.page.getByTestId('nav-history').click()
  await expect(l.page.getByTestId('history-rows')).toContainText('Archived the school year')
  await expect(l.page.getByTestId('history-rows')).toContainText(
    'Recorded locks reset to 0 0 0 0 by students'
  )
  await l.close()
})
