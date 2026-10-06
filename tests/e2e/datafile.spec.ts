import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { answerNextDialog, launchApp, placeFixture, sharedFolder } from './launch'

// SPEC.md section 12: end-to-end tests of the data file's safety rules,
// against the built app. Every file used is SYNTHETIC.

test('first run asks who is using the computer, and remembers', async () => {
  const l = await launchApp({ operator: null })
  const dialog = l.page.getByTestId('operator-dialog')
  await expect(dialog).toBeVisible()
  await l.page.keyboard.press('Escape')
  await expect(dialog).toBeVisible() // cannot be skipped
  await l.page.getByLabel('Your name').fill('Hannah Lee')
  await l.page.getByRole('button', { name: 'This is me' }).click()
  await expect(dialog).toBeHidden()
  await expect(l.page.getByTestId('operator-chip')).toContainText('Hannah Lee')
  const prefs = JSON.parse(readFileSync(join(l.userData, 'preferences.json'), 'utf8')) as {
    operatorName: string
  }
  expect(prefs.operatorName).toBe('Hannah Lee')
  await l.close()
})

test('create a school file, change it, see it saved and backed up, close it', async () => {
  const share = sharedFolder()
  const path = join(share, 'Locker data.lockers')
  const l = await launchApp()
  await answerNextDialog(l.app, 'save', path)
  await l.page.getByTestId('new-file').click()
  await l.page.getByLabel('School name').fill('SYNTHETIC Riverside College')
  await l.page.getByRole('button', { name: 'Choose where to save…' }).click()

  await expect(l.page.getByTestId('school-name')).toHaveText('SYNTHETIC Riverside College')
  await expect(l.page.getByTestId('mode-pill')).toHaveText('Editing')
  expect(existsSync(`${path}.lock`)).toBe(true)

  await l.page.getByTestId('rename-school').click()
  await l.page.getByLabel('School name').fill('SYNTHETIC Riverside Secondary College')
  await l.page.getByRole('button', { name: 'Save' }).click()
  await expect(l.page.getByTestId('school-name')).toHaveText(
    'SYNTHETIC Riverside Secondary College'
  )
  await expect(l.page.getByTestId('save-status')).toContainText('Saved', { timeout: 10_000 })
  expect(readdirSync(join(share, 'Locker Manager backups', 'Locker data'))).toHaveLength(1)

  await l.page.getByRole('button', { name: 'Close file' }).click()
  await expect(l.page.getByTestId('open-file')).toBeVisible()
  expect(existsSync(`${path}.lock`)).toBe(false)
  await expect(l.page.getByTestId('recent-files')).toContainText(
    'SYNTHETIC Riverside Secondary College'
  )
  await l.close()
})

test('two copies of the app on one file: the second is read-only and follows the first', async () => {
  const share = sharedFolder()
  const path = placeFixture(share)
  const first = await launchApp({ operator: 'Hannah' })
  const second = await launchApp({ operator: 'Dave' })

  await answerNextDialog(first.app, 'open', path)
  await first.page.getByTestId('open-file').click()
  await expect(first.page.getByTestId('mode-pill')).toHaveText('Editing')

  await answerNextDialog(second.app, 'open', path)
  await second.page.getByTestId('open-file').click()
  await expect(second.page.getByTestId('mode-pill')).toHaveText('Read-only')
  await expect(second.page.getByTestId('read-only-banner')).toContainText('Being edited by Hannah')
  await expect(second.page.getByTestId('rename-school')).toHaveCount(0)

  // The editor renames the school; the read-only copy updates by itself.
  await first.page.getByTestId('rename-school').click()
  await first.page.getByLabel('School name').fill('SYNTHETIC Renamed By Hannah')
  await first.page.getByRole('button', { name: 'Save' }).click()
  await expect(first.page.getByTestId('save-status')).toContainText('Saved', { timeout: 10_000 })
  await expect(second.page.getByTestId('school-name')).toHaveText('SYNTHETIC Renamed By Hannah', {
    timeout: 15_000
  })

  // The editor closes; the second copy is offered editing.
  await first.page.getByRole('button', { name: 'Close file' }).click()
  await expect(second.page.getByRole('button', { name: 'Start editing' })).toBeVisible({
    timeout: 15_000
  })
  await second.page.getByRole('button', { name: 'Start editing' }).click()
  await expect(second.page.getByTestId('mode-pill')).toHaveText('Editing')

  await first.close()
  await second.close()
})

test('a file held by someone on another computer opens read-only with their name', async () => {
  const share = sharedFolder()
  const path = placeFixture(share)
  const now = new Date().toISOString()
  writeFileSync(
    `${path}.lock`,
    JSON.stringify({
      format: 1,
      sessionId: 'other',
      operator: 'Hannah',
      computer: 'OFFICE-PC',
      appVersion: '0.1.0',
      pid: 1,
      startedAt: now,
      heartbeatAt: now
    })
  )
  const l = await launchApp()
  await answerNextDialog(l.app, 'open', path)
  await l.page.getByTestId('open-file').click()
  await expect(l.page.getByTestId('read-only-banner')).toContainText(
    'Being edited by Hannah on OFFICE-PC'
  )
  await expect(l.page.getByRole('button', { name: 'Take over editing' })).toHaveCount(0)
  await l.close()
})

test('a placeholder that has not synced is explained, not opened', async () => {
  const share = sharedFolder()
  const path = join(share, 'Locker data.lockers')
  writeFileSync(path, '')
  const l = await launchApp()
  await answerNextDialog(l.app, 'open', path)
  await l.page.getByTestId('open-file').click()
  await expect(l.page.getByTestId('error-message')).toContainText('has not finished syncing')
  await l.close()
})

test('a sync copy beside the file is found, compared and set aside', async () => {
  const share = sharedFolder()
  const path = placeFixture(share)
  copyFileSync(path, join(share, 'Locker data-OFFICE-PC.lockers'))
  const l = await launchApp()
  await answerNextDialog(l.app, 'open', path)
  await l.page.getByTestId('open-file').click()
  await expect(l.page.getByTestId('copies-banner')).toContainText('Locker data-OFFICE-PC.lockers')
  await l.page.getByRole('button', { name: 'Compare' }).click()
  await expect(l.page.getByTestId('conflict-dialog')).toContainText('Compare with a copy')
  await l.page.getByRole('button', { name: 'Keep the current file' }).click()
  await expect(l.page.getByTestId('copies-banner')).toHaveCount(0)
  expect(existsSync(join(share, 'Locker data-OFFICE-PC.lockers'))).toBe(false)
  expect(
    readdirSync(join(share, 'Locker Manager backups', 'Locker data')).some((f) =>
      f.includes('copy Locker data-OFFICE-PC')
    )
  ).toBe(true)
  await l.close()
})

test('the demo school is marked DEMO and has 228 lockers', async () => {
  const l = await launchApp()
  await l.page.getByTestId('open-demo').click()
  await expect(l.page.getByTestId('school-name')).toHaveText('Demo Secondary College')
  await expect(l.page.getByTestId('demo-badge').first()).toBeVisible()
  await expect(l.page.locator('dd', { hasText: '228' }).first()).toBeVisible()
  await l.close()
})

test('a backup can be previewed and restored', async () => {
  const share = sharedFolder()
  const path = placeFixture(share)
  const l = await launchApp()
  await answerNextDialog(l.app, 'open', path)
  await l.page.getByTestId('open-file').click()
  await l.page.getByTestId('rename-school').click()
  await l.page.getByLabel('School name').fill('SYNTHETIC Wrong Name')
  await l.page.getByRole('button', { name: 'Save' }).click()
  await expect(l.page.getByTestId('save-status')).toContainText('Saved', { timeout: 10_000 })

  await l.page.getByRole('button', { name: 'Backups' }).click()
  const dialog = l.page.getByTestId('backups-dialog')
  await dialog.locator('ul button').first().click()
  await expect(l.page.getByTestId('backup-preview')).toContainText('Renamed the school')
  await l.page.getByRole('button', { name: 'Restore this backup…' }).click()
  await l.page.getByRole('button', { name: 'Yes, restore it' }).click()
  await expect(dialog).toBeHidden()
  await expect(l.page.getByTestId('school-name')).toHaveText('Demo Secondary College')
  await l.close()
})
