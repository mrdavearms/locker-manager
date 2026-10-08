export { describeAction } from '@shared/history'
// Dates as staff read them: "9:12 am" today, "Yesterday, 4:05 pm", "6 Oct 2026, 9:12 am".

const time = new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })
const date = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function formatTime(iso: string): string {
  return time
    .format(new Date(iso))
    .replace(/\s?([ap])\.?m\.?/i, ' $1m')
    .toLowerCase()
}

export function formatWhen(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return 'never'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'unknown'
  const t = formatTime(iso)
  if (sameDay(d, now)) return t
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(d, yesterday)) return `Yesterday, ${t}`
  return `${date.format(d)}, ${t}`
}

/** Always the full date and time: "9 Oct 2026, 6:56 am". */
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'unknown'
  return `${date.format(d)}, ${formatTime(iso)}`
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} bytes`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-AU')} ${n === 1 ? one : many}`
}

/** "Version 0.10.0 · ae0f6f8 · built 9 Oct 2026": which build this copy is, at a glance. */
export function versionLine(info: { version: string; commit: string; builtAt: string }): string {
  const built = new Date(info.builtAt)
  const when = Number.isNaN(built.getTime()) ? 'unknown date' : date.format(built)
  return `Version ${info.version} · ${info.commit} · built ${when}`
}
