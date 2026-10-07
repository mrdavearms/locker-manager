import type { BusyState } from './update/policy'

// These flags are set around saves, prints and imports. The updater reads them
// before restarting. Kept as a tiny module so it has no dependencies.
const state: BusyState = { saving: false, printing: false, importing: false, unsavedChanges: false }
const counts = { printing: 0, importing: 0 }

export function getBusyState(): BusyState {
  return { ...state }
}

export function setBusy(partial: Partial<BusyState>): void {
  Object.assign(state, partial)
}

/** Marks a print or import as running so an update never restarts in the middle of it. */
export async function whileBusy<T>(what: 'printing' | 'importing', fn: () => Promise<T>): Promise<T> {
  counts[what]++
  state[what] = true
  try {
    return await fn()
  } finally {
    counts[what]--
    state[what] = counts[what] > 0
  }
}
