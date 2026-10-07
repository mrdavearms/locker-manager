import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { answerNextDialog, launchApp, placeFixture, sharedFolder } from './launch'

// SPEC.md 10: WCAG 2.1 AA. axe-core checks every main screen for serious and
// critical problems (contrast, labels, names, roles). Frames are left out: they hold
// printed pages, not controls.

async function check(page: Page, where: string): Promise<void> {
  await page.waitForTimeout(400)
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('iframe')
    .setLegacyMode(true)
    .analyze()
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(
    bad.map(
      (v) =>
        `${where}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(' ')} ${v.nodes[0]?.failureSummary ?? ''}`
    ),
    where
  ).toEqual([])
}

test('every main screen passes the automatic WCAG 2.1 AA checks', async () => {
  test.setTimeout(180_000)
  const l = await launchApp()
  await l.page.setViewportSize({ width: 1300, height: 900 })
  // Animations finished, so colours are checked as people finally see them.
  await l.page.emulateMedia({ reducedMotion: 'reduce' })
  await check(l.page, 'Welcome')
  await answerNextDialog(l.app, 'open', placeFixture(sharedFolder()))
  await l.page.getByTestId('open-file').click()
  await check(l.page, 'Home')
  for (const [nav, name] of [
    ['nav-students', 'Students'],
    ['nav-lockers', 'Lockers'],
    ['nav-print', 'Labels'],
    ['nav-letters', 'Letters'],
    ['nav-reports', 'Reports'],
    ['nav-history', 'History'],
    ['nav-settings', 'Settings']
  ] as const) {
    await l.page.getByTestId(nav).click()
    await check(l.page, name)
  }
  for (const tab of ['Letters', 'Privacy', 'Storage', 'This computer', 'Labels', 'Lock codes']) {
    await l.page.getByRole('tab', { name: tab }).click()
    await check(l.page, `Settings ${tab}`)
  }
  await l.page.getByTestId('open-help').click()
  await check(l.page, 'Guide')
  await l.page.getByTestId('help-tour').click()
  await check(l.page, 'Tour')
  await l.page.getByTestId('tour-skip').click()
  await l.page.getByTestId('nav-home').click()
  await l.page.getByTestId('task-start-next-year').click()
  await check(l.page, 'Start next year')

  // The same in dark mode.
  await l.page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  for (const [nav, name] of [
    ['nav-home', 'Home'],
    ['nav-students', 'Students'],
    ['nav-lockers', 'Lockers'],
    ['nav-letters', 'Letters'],
    ['nav-reports', 'Reports'],
    ['nav-settings', 'Settings']
  ] as const) {
    await l.page.getByTestId(nav).click()
    await check(l.page, `${name} (dark)`)
  }
  await l.close()
})
