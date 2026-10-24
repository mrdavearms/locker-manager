import { createContext, useContext } from 'react'
import type { RegistrationView } from '@shared/ipc'

export type RegistrationTab = 'register' | 'key'

interface RegistrationContextValue {
  /** Null until the main process has answered. */
  view: RegistrationView | null
  openRegistration: (tab: RegistrationTab) => void
}

export const RegistrationContext = createContext<RegistrationContextValue>({
  view: null,
  openRegistration: () => undefined
})

export const useRegistration = (): RegistrationContextValue => useContext(RegistrationContext)

/** True once main has said this copy has no key (a development copy never says so). */
export const useUnregistered = (): boolean => useRegistration().view?.state === 'unregistered'

/** The words on the first screen and the new-file dialog of an unregistered copy. */
export function registerHeading(appName: string): string {
  return `Register ${appName}`
}

export function registerBlurb(appName: string, demoAllowed: boolean): string {
  const start = `${appName} is free for schools. Register once and every computer that opens your school's file is covered.`
  return demoAllowed
    ? `${start} Until then you can try the demo school.`
    : `${start} You need to register before you can start. You can still open your school's file to look things up.`
}
