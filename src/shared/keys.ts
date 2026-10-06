// The key register (SPEC.md 3.4 and 4.9): keys issued, returned, lost, replaced and charged.

export const KEY_EVENTS = ['issued', 'returned', 'lost', 'replaced', 'charged'] as const
export type KeyEventKind = (typeof KEY_EVENTS)[number]

export const KEY_EVENT_TEXT: Record<KeyEventKind, string> = {
  issued: 'Key given out',
  returned: 'Key returned',
  lost: 'Key lost',
  replaced: 'Key replaced',
  charged: 'Charged for a key'
}

export interface KeyEventView {
  id: string
  event: KeyEventKind
  date: string
  student: string | null
  notes: string | null
  amountCents: number | null
  by: string
}

export interface KeyInfo {
  lockId: string
  keyNumber: string | null
  /** Keys given out and not returned. */
  keysOut: number
  events: KeyEventView[]
}
