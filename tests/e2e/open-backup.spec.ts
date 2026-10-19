import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { expect, test } from '@playwright/test'
import { answerNextDialog, launchApp, placeFixture, sharedFolder } from './launch'

// docs/audits/2026-10-20-stability-audit.md, finding 5: a damaged file said "open a
// backup", but the app could not open one.
test('a damaged file can be replaced by a backup from the first screen', async () => {
  const share = sharedFolder()
  const path = placeFixture(share)
  const folder = join(share, 'Locker Manager backups', 'Locker data')
  mkdirSync(folder, { recursive: true })
  const backup = join(folder, 'Locker data 2026-10-19 151200.lockers.gz')
  writeFileSync(backup, gzipSync(readFileSync(path)))
  writeFileSync(path, 'SQLite format 3\0' + 'x'.repeat(5000))

  const l = await launchApp()
  await answerNextDialog(l.app, 'open', backup)
  await answerNextDialog(l.app, 'save', path)
  await l.page.getByTestId('open-backup').click()
  await expect(l.page.getByTestId('mode-pill')).toHaveText('Editing', { timeout: 20_000 })
  expect(readdirSync(folder).some((f) => f.includes('set aside when a backup was restored'))).toBe(
    true
  )
  await l.close()
})
