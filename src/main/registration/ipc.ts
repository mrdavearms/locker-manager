import { app, BrowserWindow, ipcMain, net, shell } from 'electron'
import log from 'electron-log/main'
import {
  channels,
  RegistrationKeySchema,
  RegistrationMailtoSchema,
  type EnterKeyResult,
  type RegistrationView
} from '@shared/ipc'
import {
  REGISTER_PAGE_URL,
  REGISTRATION_URL,
  RegistrationFormSchema,
  type SendResult
} from '@shared/registration'
import { fileServiceReady, fileSession, reopenAfterRegistration } from '../fileService'
import { enforced, enterKey, statusFor, toRegistrationView } from './registration'
import { sendRegistration } from './send'

/** This copy's registration now, counting a key in the open file. */
function currentView(): RegistrationView {
  const session = fileServiceReady() ? fileSession() : null
  const status = session?.isOpen ? session.read((db) => statusFor(db)) : statusFor(null)
  return toRegistrationView(status, enforced())
}

function tellWindows(): void {
  const view = currentView()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channels.registrationChanged, view)
  }
}

export function registerRegistrationHandlers(): void {
  ipcMain.handle(channels.registrationGet, (): RegistrationView => currentView())

  ipcMain.handle(
    channels.registrationEnterKey,
    async (_e, raw: unknown): Promise<EnterKeyResult> => {
      const { key } = RegistrationKeySchema.parse(raw)
      const result = await enterKey(key)
      if (!result.ok) return result
      log.info('registration key entered')
      // A file open read-only only for want of a key opens again for editing.
      const reopened = await reopenAfterRegistration().catch((error: unknown) => {
        log.warn('could not reopen the file after registering', String(error))
        return null
      })
      if (reopened && !reopened.ok) log.info('reopen after registering refused')
      tellWindows()
      return { ok: true, view: toRegistrationView(result.status, enforced()) }
    }
  )

  // Sent only when a person presses Send (registration design 6.1).
  ipcMain.handle(channels.registrationSend, async (_e, raw: unknown): Promise<SendResult> => {
    const form = RegistrationFormSchema.parse(raw)
    const result = await sendRegistration(form, {
      // Electron's fetch goes through the computer's proxy settings, as schools need.
      fetch: (input: string | URL | Request, init?: RequestInit) =>
        net.fetch(input instanceof URL ? input.href : input, init),
      url: REGISTRATION_URL,
      appVersion: app.getVersion()
    })
    log.info(`registration send ${result.ok ? 'ok' : `failed (${result.reason})`}`)
    return result
  })

  ipcMain.handle(channels.registrationOpenWebsite, async () => {
    await shell.openExternal(REGISTER_PAGE_URL)
  })

  ipcMain.handle(channels.registrationOpenEmail, async (_e, raw: unknown) => {
    const { url } = RegistrationMailtoSchema.parse(raw)
    await shell.openExternal(url)
  })
}
