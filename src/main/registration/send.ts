import type { RegistrationForm, SendResult } from '../../shared/registration'

const MAIL_TO = 'dave@dandsarmstrong.com'

const MESSAGES = {
  offline:
    "Locker Manager couldn't reach the registration service. Your school's network may be blocking it, or this computer is offline.",
  blocked:
    "Your school's network blocked the registration. You can register on the website instead, or send it by email.",
  too_many:
    'Too many registrations have come from this network in the last hour. Try again later, or send it by email.',
  server: 'The registration service had a problem. Try again in a few minutes, or send it by email.'
} as const

/** A ready-made email, for when the app cannot reach the registration service. */
export function registrationMailto(form: RegistrationForm, appVersion: string): string {
  const lines = [
    `Name: ${form.name}`,
    `School: ${form.school}`,
    `Email: ${form.email}`,
    `State: ${form.state}`,
    ...(form.role ? [`Role: ${form.role}`] : []),
    `App version: ${appVersion}`
  ]
  const subject = encodeURIComponent('Locker Manager registration')
  const body = encodeURIComponent(lines.join('\n'))
  return `mailto:${MAIL_TO}?subject=${subject}&body=${body}`
}

export async function sendRegistration(
  form: RegistrationForm,
  deps: { fetch: typeof fetch; url: string; appVersion: string; timeoutMs?: number }
): Promise<SendResult> {
  const fail = (reason: keyof typeof MESSAGES): SendResult => ({
    ok: false,
    reason,
    message: MESSAGES[reason],
    mailto: registrationMailto(form, deps.appVersion)
  })
  let res: Response
  try {
    res = await deps.fetch(deps.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...form, source: 'app', appVersion: deps.appVersion }),
      signal: AbortSignal.timeout(deps.timeoutMs ?? 15_000)
    })
  } catch {
    return fail('offline')
  }
  if (res.status === 403) return fail('blocked')
  if (res.status === 429) return fail('too_many')
  if (!res.ok) return fail('server')
  // A school filter often answers 200 with its own web page.
  if ((res.headers.get('content-type') ?? '').toLowerCase().includes('text/html')) {
    return fail('blocked')
  }
  return { ok: true }
}
