import type { BusyState } from './update/policy'

// Later milestones set these flags around saves, prints and imports. The updater
// reads them before restarting. Kept as a tiny module so it has no dependencies.
const state: BusyState = { saving: false, printing: false, importing: false, unsavedChanges: false }

export function getBusyState(): BusyState {
  return { ...state }
}

export function setBusy(partial: Partial<BusyState>): void {
  Object.assign(state, partial)
}
