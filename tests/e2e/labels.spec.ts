import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { answerNextDialog, launchApp, placeFixture, sharedFolder } from './launch'

// SPEC.md 5.1 and section 12: labels come out at exact millimetre geometry. The
// PDF is read back with pdf.js and positions are checked in millimetres; the
// preview is compared with a stored image (macOS only: font smoothing differs
// between systems, so other systems check geometry only).

const PT = 25.4 / 72

async function readPdf(path: string) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(path)),
    useSystemFonts: false
  }).promise
  const page = await doc.getPage(1)
  const view = page.view
  const text = await page.getTextContent()
  const items = text.items.flatMap((i) =>
    'str' in i
      ? [
          {
            str: i.str,
            x: i.transform[4] as number,
            y: i.transform[5] as number,
            w: i.width as number
          }
        ]
      : []
  )
  return {
    pages: doc.numPages,
    widthMm: (view[2]! - view[0]!) * PT,
    heightMm: (view[3]! - view[1]!) * PT,
    items
  }
}

test('labels: a real PDF at exact millimetres, and the preview matches the reference image', async () => {
  const share = sharedFolder()
  const l = await launchApp()
  await l.page.setViewportSize({ width: 1400, height: 1500 })
  await answerNextDialog(l.app, 'open', placeFixture(share))
  await l.page.getByTestId('open-file').click()
  // Allocate first, so the labels carry real (SYNTHETIC) names at their fitted sizes.
  await l.page.getByTestId('nav-lockers').click()
  await l.page.getByTestId('open-allocate').click()
  await l.page.getByTestId('make-draft').click()
  await l.page.getByTestId('commit-allocation').click()
  await l.page.getByRole('button', { name: /See the lockers/ }).click()
  await l.page.getByTestId('nav-print').click()
  await expect(l.page.getByTestId('labels-count')).toHaveText('228 labels on 17 sheets.')

  // Golden visual test of the first sheet.
  await l.page.getByTestId('labels-mode-lockers').click()
  await l.page.getByLabel('Locker numbers').fill('1-14')
  await expect(l.page.getByTestId('labels-count')).toHaveText('14 labels on 1 sheet.')
  // The sheet sits in a sandboxed frame: take the whole window and cut the sheet out.
  await l.page.waitForTimeout(1000)
  const box = (await l.page.getByLabel('Label sheets', { exact: true }).boundingBox())!
  const whole = PNG.sync.read(await l.page.screenshot())
  const x0 = Math.round(box.x)
  const y0 = Math.round(box.y)
  const w = Math.min(Math.round(box.width), whole.width - x0)
  const h = Math.min(Math.round(box.height), whole.height - y0)
  const shot = new PNG({ width: w, height: h })
  PNG.bitblt(whole, shot, x0, y0, w, h, 0, 0)
  const goldenPath = resolve('tests/golden/labels-L7163-sheet1.png')
  if (process.platform === 'darwin') {
    if (!existsSync(goldenPath) || process.env.UPDATE_GOLDEN === '1')
      writeFileSync(goldenPath, PNG.sync.write(shot))
    const golden = PNG.sync.read(readFileSync(goldenPath))
    expect([shot.width, shot.height]).toEqual([golden.width, golden.height])
    const diff = pixelmatch(shot.data, golden.data, undefined, shot.width, shot.height, {
      threshold: 0.2
    })
    expect(diff / (shot.width * shot.height)).toBeLessThan(0.02)
  }

  // A real PDF, read back.
  await l.page.getByTestId('labels-mode-all').click()
  await expect(l.page.getByTestId('labels-count')).toHaveText('228 labels on 17 sheets.')
  const pdfPath = join(share, 'labels.pdf')
  await answerNextDialog(l.app, 'save', pdfPath)
  await l.page.getByTestId('labels-save-pdf').click()
  await expect(l.page.getByTestId('labels-saved')).toBeVisible({ timeout: 30_000 })
  const pdf = await readPdf(pdfPath)
  expect(pdf.pages).toBe(17)
  // Chromium sets PDF page sizes in small steps: A4 comes out 0.11 mm narrow at most.
  // Content is placed from the top-left corner in exact millimetres regardless.
  expect(Math.abs(pdf.widthMm - 210)).toBeLessThan(0.15)
  expect(Math.abs(pdf.heightMm - 297)).toBeLessThan(0.15)
  // "LOCKER 1" is right-aligned in the box that ends 5 mm inside label 1's right edge.
  const l1 = pdf.items.find((i) => i.str === 'LOCKER 1')
  expect(l1).toBeDefined()
  const rightEdgeMm = (l1!.x + l1!.w) * PT
  expect(rightEdgeMm).toBeGreaterThan(4.65 + 99.1 - 5 - 1.5)
  expect(rightEdgeMm).toBeLessThanOrEqual(4.65 + 99.1 - 5 + 0.2)
  const fromTopMm = pdf.heightMm - l1!.y * PT
  expect(fromTopMm).toBeGreaterThan(15.15 + 25)
  expect(fromTopMm).toBeLessThan(15.15 + 38.1 - 5 + 0.2)
  // The second label in the first row starts 101.6 mm further right.
  const l2 = pdf.items.find((i) => i.str === 'LOCKER 2')!
  expect((l2.x - l1!.x) * PT + (l2.w - l1!.w) * PT).toBeCloseTo(101.6, 0)

  // The calibration page saves too.
  await l.page.getByRole('button', { name: /Label settings/ }).click()
  await answerNextDialog(l.app, 'save', join(share, 'calibration.pdf'))
  await l.page.getByTestId('calibration-pdf').click()
  await expect
    .poll(() => existsSync(join(share, 'calibration.pdf')), { timeout: 30_000 })
    .toBe(true)
  const cal = await readPdf(join(share, 'calibration.pdf'))
  expect(cal.pages).toBe(1)
  expect(cal.items.some((i) => i.str.includes('must measure exactly 100 mm'))).toBe(true)
  await l.close()
})
