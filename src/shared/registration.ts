/** What a signed registration key says. Shared by the window, the app and the registration service. */
export interface RegistrationDetails {
  v: 1
  /** Registration number, for example 'R-00012'. */
  id: string
  school: string
  name: string
  email: string
  /** 'YYYY-MM-DD' */
  issued: string
  plan: 'free'
  /** 'YYYY-MM-DD', or null when the key never expires. */
  expires: string | null
}

export const KEY_PREFIX = 'LM1.'
