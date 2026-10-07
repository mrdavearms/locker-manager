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

/** Opens the demo-shaped fixture, allocates everyone, and goes to Letters. */
async function lettersForEveryone(): Promise<{
  l: Awaited<ReturnType<typeof launchApp>>
  share: string
  total: number
}> {
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
  await l.page.getByTestId('nav-letters').click()
  await expect(l.page.getByTestId('letters-count')).toContainText(/Letter 1 of \d+/)
  const total = Number(
    /of (\d+)/.exec((await l.page.getByTestId('letters-count').textContent())!)![1]
  )
  return { l, share, total }
}

test('every student’s letters show a progress bar, then save as one PDF', async () => {
  test.setTimeout(180_000)
  const { l, share, total } = await lettersForEveryone()
  const out = join(share, 'everyone.pdf')
  await answerNextDialog(l.app, 'save', out)
  const started = Date.now()
  await l.page.getByTestId('letters-save-pdf').click()
  await expect(l.page.getByTestId('letters-progress')).toBeVisible()
  await expect(l.page.getByLabel('Making the letters')).toBeVisible()
  await expect(l.page.getByTestId('letters-saved')).toBeVisible({ timeout: 60_000 })
  const seconds = (Date.now() - started) / 1000
  console.log(`${total} letters saved as a PDF in ${seconds.toFixed(1)} s`)
  expect(seconds).toBeLessThan(30)
  await expect(l.page.getByTestId('letters-progress')).toHaveCount(0)
  expect(await pages(out)).toBe(total)
  await l.close()
})

test('Cancel stops the letters: nothing is saved, recorded or reported as an error', async () => {
  test.setTimeout(180_000)
  const { l, share } = await lettersForEveryone()
  // Slow every hidden page down so Cancel always lands before the last chunk.
  await l.app.evaluate(({ BrowserWindow }) => {
    const proto = BrowserWindow.prototype
    const load = proto.loadFile
    proto.loadFile = async function (this: typeof proto, ...args: Parameters<typeof load>) {
      await new Promise((resolve) => setTimeout(resolve, 400))
      return load.apply(this, args)
    }
  })
  const out = join(share, 'cancelled.pdf')
  await answerNextDialog(l.app, 'save', out)
  await l.page.getByTestId('letters-save-pdf').click()
  await expect(l.page.getByTestId('letters-progress')).toBeVisible()
  await l.page.getByTestId('letters-cancel').click()
  await expect(l.page.getByTestId('letters-progress')).toHaveCount(0, { timeout: 30_000 })
  await expect(l.page.getByTestId('letters-saved')).toHaveCount(0)
  await expect(l.page.getByTestId('error-dialog')).toHaveCount(0)
  expect(existsSync(out)).toBe(false)
  await expect(l.page.getByTestId('letters-save-pdf')).toBeEnabled()
  await l.page.getByTestId('nav-history').click()
  await expect(l.page.getByTestId('history-rows')).toBeVisible()
  await expect(l.page.getByTestId('history-rows')).not.toContainText('Printed letters')
  await l.close()
})
