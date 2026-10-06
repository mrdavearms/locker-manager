import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import { expect, test } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { answerNextDialog, launchApp, placeFixture, sharedFolder } from './launch'

// SPEC.md 4.8, 4.9, 5.2, 5.4 and 5.5 end to end on the SYNTHETIC demo school:
// letters (one page each, codes hidden on screen), reports, exports, and a new file
// rebuilt from a portable export.

async function pages(path: string): Promise<number> {
  return (await PDFDocument.load(readFileSync(path))).getPageCount()
}

test('letters, reports and the portable export', async () => {
  test.setTimeout(180_000)
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

  // Letters: the preview hides codes; every letter is checked to fit one page.
  await l.page.getByTestId('nav-letters').click()
  await expect(l.page.getByTestId('letters-count')).toContainText(/Letter 1 of \d+/)
  const total = Number(
    /of (\d+)/.exec((await l.page.getByTestId('letters-count').textContent())!)![1]
  )
  expect(total).toBeGreaterThan(200)
  await expect(l.page.getByTestId('letters-count')).toContainText('Every letter fits on one page', {
    timeout: 60_000
  })
  const frame = l.page.frameLocator('iframe[title="Letter preview"]')
  await expect(frame.locator('.code span').first()).toHaveText('•')
  await l.page.getByTestId('letters-next').click()
  await expect(l.page.getByTestId('letters-count')).toContainText('Letter 2 of')

  // One group's letters as a PDF: one page per letter.
  await l.page.getByTestId('letters-mode-group').click()
  await l.page.getByLabel('Homeroom', { exact: true }).selectOption({ label: '7A' })
  await expect(l.page.getByTestId('letters-count')).toContainText(/Letter 1 of \d+/)
  const groupCount = Number(
    /of (\d+)/.exec((await l.page.getByTestId('letters-count').textContent())!)![1]
  )
  const lettersPdf = join(share, 'letters.pdf')
  await answerNextDialog(l.app, 'save', lettersPdf)
  await l.page.getByTestId('letters-save-pdf').click()
  await expect(l.page.getByTestId('letters-saved')).toBeVisible({ timeout: 60_000 })
  expect(await pages(lettersPdf)).toBe(groupCount)

  // The letter designer explains sections and the editing rule.
  await l.page.getByRole('button', { name: /Change the letter/ }).click()
  await expect(l.page.getByTestId('letters-how')).toContainText('built from sections')
  await expect(l.page.getByTestId('letters-how')).toContainText('open for editing')
  await l.page.getByRole('button', { name: 'Every day', exact: true }).click()
  await l.page.getByTestId('letter-block-body').fill('- Lock your locker every time.')
  await l.page.getByTestId('letters-save-template').click()
  await expect(l.page.getByTestId('letters-save-template')).toHaveCount(0)

  // Reports: the master list needs the "I understand" tick and is confidential.
  await l.page.getByTestId('nav-reports').click()
  await expect(l.page.getByTestId('report-rows')).toContainText('row')
  await l.page.getByTestId('report-master').click()
  await expect(l.page.getByTestId('report-save-pdf')).toBeDisabled()
  await l.page.getByTestId('report-understood').check()
  const masterPdf = join(share, 'master.pdf')
  await answerNextDialog(l.app, 'save', masterPdf)
  await l.page.getByTestId('report-save-pdf').click()
  await expect(l.page.getByTestId('report-saved')).toBeVisible({ timeout: 30_000 })
  expect(await pages(masterPdf)).toBeGreaterThan(3)

  // Group lists to Excel.
  await l.page.getByTestId('report-group_lists').click()
  const xlsx = join(share, 'groups.xlsx')
  await answerNextDialog(l.app, 'save', xlsx)
  await l.page.getByTestId('report-export-xlsx').click()
  await expect.poll(() => existsSync(xlsx), { timeout: 30_000 }).toBe(true)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(xlsx)
  expect(wb.worksheets[0]!.rowCount).toBeGreaterThan(200)

  // History records the letters and the codes printed.
  await l.page.getByTestId('nav-history').click()
  await expect(l.page.getByTestId('history-rows')).toContainText('Printed letters')
  await expect(l.page.getByTestId('history-rows')).toContainText('Printed a report')

  // Whole-file export without codes, then a new file made from it.
  await l.page.getByTestId('nav-reports').click()
  const portable = join(share, 'portable.xlsx')
  await answerNextDialog(l.app, 'save', portable)
  await l.page.getByTestId('export-all').click()
  await expect.poll(() => existsSync(portable), { timeout: 30_000 }).toBe(true)
  await l.page.getByRole('button', { name: /Close file/ }).click()
  await answerNextDialog(l.app, 'open', portable)
  const rebuilt = join(share, 'Rebuilt.lockers')
  await answerNextDialog(l.app, 'save', rebuilt)
  await l.page.getByTestId('file-from-export').click()
  await expect(l.page.getByTestId('nav-home')).toBeVisible({ timeout: 30_000 })
  expect(existsSync(rebuilt)).toBe(true)
  await l.close()
})
