import { z } from 'zod'

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

/** Dave's address: registrations by email go here, and keys come from here. */
export const REGISTRATION_EMAIL = 'dave@dandsarmstrong.com'

/** The registration service's `register` function (Firebase project locker-manager-reg, Sydney). */
export const REGISTRATION_URL =
  'https://australia-southeast1-locker-manager-reg.cloudfunctions.net/register'

/** The website form, used when the app cannot reach the service. */
export const REGISTER_PAGE_URL = 'https://mrdavearms.github.io/locker-manager/register/'

export const RegistrationFormSchema = z.object({
  name: z.string().trim().min(2).max(100),
  school: z.string().trim().min(3).max(150),
  email: z.string().trim().email().max(200),
  state: z.enum(['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA', 'Outside Australia']),
  role: z.string().trim().max(100).optional(),
  privacyAgreed: z.literal(true)
})
export type RegistrationForm = z.infer<typeof RegistrationFormSchema>

export type SendResult =
  | { ok: true }
  | {
      ok: false
      reason: 'offline' | 'blocked' | 'server' | 'too_many'
      message: string
      mailto: string
    }
