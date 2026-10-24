import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import initSqlJs from 'sql.js'
import { answerNextDialog, launchApp, placeFixture, sharedFolder } from './launch'
import { makeKey } from './registrationKeys'

// Registration is enforced in these tests (LOCKER_MANAGER_REGISTRATION=enforce) with a
// key pair made when the tests start. Every file is SYNTHETIC.

/** A key split over several lines, as it looks when copied out of an email. */
function pasted(key: string): string {
  return key.match(/.{1,40}/g)!.join('\n')
}

/** The SYNTHETIC fixture is a demo file, which never needs a key. Make it an ordinary school file. */
async function placeSchoolFile(folder: string): Promise<string> {
  const path = placeFixture(folder)
  const SQL = await initSqlJs()
  const db = new SQL.Database(readFileSync(path))
  db.run("UPDATE meta SET value = '0' WHERE key = 'demo'")
  writeFileSync(path, db.export())
  db.close()
  return path
}

test('a new install can try the demo but not start a school file', async () => {
  const l = await launchApp({ registration: 'enforce' })
  const p = l.page
  await expect(p.getByTestId('register-button')).toBeVisible()
  await p.getByTestId('open-demo').click()
  await expect(p.getByTestId('mode-pill')).toHaveText('Editing', { timeout: 20_000 })
  await p.getByRole('button', { name: 'Close file' }).click()

  await p.getByTestId('new-file').click()
  await expect(p.getByTestId('new-file-register')).toContainText('Register once')
  await expect(p.getByLabel('School name')).toHaveCount(0)
  await l.close()
})

test('a pasted key registers the copy', async () => {
  const l = await launchApp({ registration: 'enforce' })
  const p = l.page
  await p.getByTestId('have-key-button').click()
  await p.getByTestId('key-input').fill(pasted(makeKey()))
  await p.getByTestId('key-submit').click()
  await expect(p.getByTestId('key-message')).toHaveText('Registered to Example Secondary College.')
  await p.getByRole('button', { name: 'Done' }).click()
  await expect(p.getByTestId('register-button')).toHaveCount(0)

  await p.getByTestId('new-file').click()
  await expect(p.getByLabel('School name')).toBeVisible()
  await l.close()
})

test('a wrong key says why', async () => {
  const l = await launchApp({ registration: 'enforce' })
  const p = l.page
  await p.getByTestId('have-key-button').click()
  await p.getByTestId('key-input').fill('hello')
  await p.getByTestId('key-submit').click()
  await expect(p.getByTestId('key-message')).toContainText(
    "That doesn't look like a Locker Manager key"
  )
  await l.close()
})

test('an unregistered copy opens a school file read-only and leaves the lock alone', async () => {
  const share = sharedFolder()
  const path = await placeSchoolFile(share)
  const l = await launchApp({ registration: 'enforce' })
  await answerNextDialog(l.app, 'open', path)
  await l.page.getByTestId('open-file').click()
  await expect(l.page.getByTestId('read-only-banner')).toContainText('not registered', {
    timeout: 20_000
  })
  expect(existsSync(`${path}.lock`)).toBe(false)
  await l.close()
})

test('entering a key while a file is open starts editing, and a key in the file covers a new computer', async () => {
  const share = sharedFolder()
  const path = await placeSchoolFile(share)
  const l = await launchApp({ registration: 'enforce' })
  await answerNextDialog(l.app, 'open', path)
  await l.page.getByTestId('open-file').click()
  await expect(l.page.getByTestId('read-only-banner')).toContainText('not registered', {
    timeout: 20_000
  })

  await l.page.getByTestId('have-key-button').click()
  await l.page.getByTestId('key-input').fill(pasted(makeKey()))
  await l.page.getByTestId('key-submit').click()
  await expect(l.page.getByTestId('key-message')).toContainText('Registered to')
  await l.page.getByRole('button', { name: 'Done' }).click()
  await expect(l.page.getByTestId('read-only-banner')).toHaveCount(0, { timeout: 20_000 })
  await expect(l.page.getByTestId('mode-pill')).toHaveText('Editing')

  await l.page.getByTestId('nav-history').click()
  await expect(l.page.getByTestId('history-rows')).toContainText(
    'Registration added to this file',
    { timeout: 20_000 }
  )
  // Wait for the debounced save to reach the file on disk, then close so the lock goes.
  await expect(l.page.getByTestId('save-status')).toContainText('Saved', { timeout: 20_000 })
  await l.page.getByRole('button', { name: 'Close file' }).click()
  await expect(l.page.getByTestId('open-file')).toBeVisible()
  await l.close()

  // A second computer: fresh settings, no key of its own, a copy of the saved file.
  const share2 = sharedFolder()
  const path2 = join(share2, 'Locker data.lockers')
  copyFileSync(path, path2)
  const l2 = await launchApp({ registration: 'enforce' })
  await answerNextDialog(l2.app, 'open', path2)
  await l2.page.getByTestId('open-file').click()
  await expect(l2.page.getByTestId('mode-pill')).toHaveText('Editing', { timeout: 20_000 })
  await expect(l2.page.getByTestId('read-only-banner')).toHaveCount(0)
  await expect
    .poll(
      () =>
        (
          JSON.parse(readFileSync(join(l2.userData, 'preferences.json'), 'utf8')) as {
            registrationKey?: string | null
          }
        ).registrationKey ?? null,
      { timeout: 15_000 }
    )
    .toMatch(/^LM1\./)
  await l2.close()
})

test('an existing install with no key is look-only after updating', async () => {
  const share = sharedFolder()
  const path = await placeSchoolFile(share)
  // launchApp's default sets an operator name, as an already-installed copy has.
  const l = await launchApp({ registration: 'enforce', operator: 'Existing Operator' })
  await answerNextDialog(l.app, 'open', path)
  await l.page.getByTestId('open-file').click()
  await expect(l.page.getByTestId('read-only-banner')).toContainText('not registered', {
    timeout: 20_000
  })
  await l.close()
})

test('Open a backup needs a key', async () => {
  const l = await launchApp({ registration: 'enforce' })
  // A dialog that would fail the test if it were ever shown.
  await l.app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = (async () => {
      throw new Error('a file dialog opened')
    }) as typeof dialog.showOpenDialog
  })
  await l.page.getByTestId('open-backup').click()
  await expect(l.page.getByTestId('registration-dialog')).toBeVisible()
  await l.close()
})

const SOMETHING_WRONG =
  'Something went wrong. Try again, or close Locker Manager and open it again.'

test('a key form whose request fails says so and can be tried again', async () => {
  const l = await launchApp({ registration: 'enforce' })
  await l.app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('registration:enterKey')
    ipcMain.handle('registration:enterKey', () => {
      throw new Error('broken on purpose')
    })
  })
  const p = l.page
  await p.getByTestId('have-key-button').click()
  await p.getByTestId('key-input').fill(pasted(makeKey()))
  await p.getByTestId('key-submit').click()
  await expect(p.getByTestId('key-message')).toHaveText(SOMETHING_WRONG)
  await expect(p.getByTestId('key-submit')).toBeEnabled()
  await l.close()
})

test('Send, the website form and the email say so when they fail', async () => {
  const l = await launchApp({ registration: 'enforce' })
  await l.app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('registration:send')
    ipcMain.handle('registration:send', () => {
      throw new Error('broken on purpose')
    })
  })
  const p = l.page
  await p.getByTestId('register-button').click()
  await expect(p.getByTestId('registration-dialog')).toContainText(
    "We collect your name, school, email, state and role to send your registration key and to contact your school about Locker Manager. It is kept on Google Cloud in Sydney and in Dave Armstrong's email, seen only by Dave Armstrong, and never shared. Email dave@dandsarmstrong.com to have it removed."
  )
  await p.locator('#reg-name').fill('Pat Example')
  await p.locator('#reg-school').fill('Example Secondary College')
  await p.locator('#reg-email').fill('pat@example.edu.au')
  await p.locator('#reg-state').selectOption('VIC')
  await p.getByTestId('privacy-agree').check()
  await p.getByTestId('send-registration').click()
  await expect(p.getByTestId('registration-error')).toHaveText(SOMETHING_WRONG)
  await expect(p.getByTestId('send-registration')).toHaveText('Send')
  await expect(p.getByTestId('send-registration')).toBeEnabled()

  // Now Send fails the ordinary way, and both ways round it fail too.
  await l.app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('registration:send')
    ipcMain.handle('registration:send', () => ({
      ok: false,
      reason: 'offline',
      message: 'Offline on purpose.',
      mailto: 'mailto:dave@dandsarmstrong.com?subject=a&body=b'
    }))
    for (const channel of ['registration:openWebsite', 'registration:openEmail']) {
      ipcMain.removeHandler(channel)
      ipcMain.handle(channel, () => {
        throw new Error('broken on purpose')
      })
    }
  })
  await p.getByTestId('send-registration').click()
  await expect(p.getByTestId('send-failed')).toContainText('Offline on purpose.')
  await expect(p.getByTestId('registration-error')).toHaveCount(0)
  await p.getByRole('button', { name: 'Use the website form' }).click()
  await expect(p.getByTestId('registration-error')).toHaveText(SOMETHING_WRONG)
  await p.getByTestId('send-registration').click()
  await expect(p.getByTestId('registration-error')).toHaveCount(0)
  await p.getByRole('button', { name: 'Send by email instead' }).click()
  await expect(p.getByTestId('registration-error')).toHaveText(SOMETHING_WRONG)
  await l.close()
})
