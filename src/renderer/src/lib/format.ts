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

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} bytes`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-AU')} ${n === 1 ? one : many}`
}

/** "school.renamed" -> "Renamed the school". Unknown actions are shown tidied. */
export function describeAction(action: string): string {
  const known: Record<string, string> = {
    'file.created': 'Created the file',
    'file.migrated': 'Updated the file for a new version',
    'file.restored': 'Restored a backup',
    'school.renamed': 'Renamed the school',
    'lock.taken_over': 'Took over editing',
    'conflict.kept_mine': 'Kept their own version in a conflict',
    'copy.set_aside': 'Set aside a sync copy',
    'copy.used': 'Used a sync copy',
    'demo.generated': 'Built the demo school'
  }
  return known[action] ?? action.replace(/[._]/g, ' ')
}
