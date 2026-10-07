import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { answerNextDialog, launchApp, sharedFolder } from './launch'

// SPEC.md 4.2 end to end: two Compass exports (one per year level), with the
// traps from section 15: capitals, Mac, particles, a Year 8 student in the Year 7
// file, HUB and ZZZ. All SYNTHETIC.

const Y7 = resolve('tests/fixtures/import/Student Year Level Year 7 Export - SYNTHETIC.csv')
const Y8 = resolve('tests/fixtures/import/Student Year Level Year 8 Export - SYNTHETIC.csv')

test('import two Compass exports, check, compare and apply', async () => {
  const share = sharedFolder()
  const l = await launchApp()
  await answerNextDialog(l.app, 'save', join(share, 'Locker data.lockers'))
  await l.page.getByTestId('new-file').click()
  await l.page.getByLabel('School name').fill('SYNTHETIC Import College')
  await l.page.getByRole('button', { name: 'Choose where to save…' }).click()
  await l.page.getByTestId('nav-home').click()

  await l.page.getByTestId('task-import-students').click()
  await l.page.getByTestId('import-file-input').setInputFiles([Y7, Y8])
  await l.page.getByTestId('import-read').click()

  // Columns: recognised as Compass, year from the file name.
  await expect(
    l.page.getByText('Recognised as Compass (Student Year Level Export).').first()
  ).toBeVisible()
  await expect(l.page.getByLabel('Year level for everyone in this file').first()).toHaveValue('7')
  await l.page.getByTestId('import-next').click()

  // Check: the Year 8 student in the Year 7 file, and the names to check.
  const problems = l.page.getByTestId('import-problems')
  await expect(problems).toContainText('An Tran (SYN8050) looks like year 8')
  await expect(problems).toContainText('Hamish Macdonald: Mac name')
  await expect(problems).toContainText('Kushi Wickramasinghe Arachchige: Two-word surname')
  await l.page.getByTestId('import-next').click()

  await expect(l.page.getByTestId('import-new')).toContainText('McNair, Leo')
  await expect(l.page.getByTestId('import-new')).toContainText("O'Brien, Mia")
  await l.page.getByTestId('import-apply').click()
  await expect(l.page.getByTestId('import-done')).toContainText('12 students added')
  await expect(l.page.getByRole('button', { name: 'Give out lockers now' })).toBeVisible()
  await l.page.getByRole('button', { name: 'See the students' }).click()

  await expect(l.page.getByRole('tab', { name: /Names to check/ })).toContainText('4')
  await l.page.getByTestId('student-search').fill('macdonald')
  await l.page.getByRole('button', { name: 'Macdonald, Hamish' }).click()
  await l.page.getByLabel('Last name').fill('MacDonald')
  await l.page.getByRole('button', { name: 'Save name' }).click()
  await expect(l.page.getByRole('button', { name: 'MacDonald, Hamish' })).toBeVisible()
  await expect(l.page.getByText('This name was corrected by hand')).toBeVisible()
  await l.close()
})
