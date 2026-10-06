// Group codes from the student system, made readable (SPEC.md 4.2):
// "07A" becomes "7A", and the year level can be read from the code.

/** Automatic rule: drop leading zeros from the leading digits. "07A" -> "7A", "HUB" -> "HUB". */
export function defaultGroupDisplay(code: string): string {
  const c = code.trim()
  const m = /^0+(\d.*)$/.exec(c)
  return m ? m[1]! : c
}

export function displayGroup(code: string | null, map: Record<string, string>): string | null {
  if (code === null || code.trim() === '') return null
  const c = code.trim()
  return map[c]?.trim() || defaultGroupDisplay(c)
}

/** "07A" -> "7"; "12B" -> "12"; "HUB" -> null. */
export function yearFromGroup(code: string | null): string | null {
  if (!code) return null
  const m = /^0*(\d{1,2})(?!\d)/.exec(code.trim())
  return m ? String(Number(m[1])) : null
}

/** "Year 7", "Yr 07", "Grade 9", "7" -> "7"; "Prep", "Foundation", "K" kept as words. */
export function normaliseYearLevel(raw: string | null): string | null {
  if (raw === null) return null
  const s = raw.trim()
  if (s === '') return null
  const m = /(\d{1,2})/.exec(s)
  if (m) return String(Number(m[1]))
  return s
}

/** "Student Year Level Year 7 Export - 2026-10-02.csv" -> "7". */
export function yearFromFileName(name: string): string | null {
  const m = /(?:year|yr|grade|level)[\s_-]*0?(\d{1,2})(?!\d)/i.exec(name)
  return m ? String(Number(m[1])) : null
}
