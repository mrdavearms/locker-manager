import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { DEFAULT_TERMS, type Terminology } from '@shared/terminology'

interface AppContextValue {
  revision: number
  canEdit: boolean
  editingBy: string | null
  needsNewerApp: boolean
  terms: Terminology
  showError: (message: string) => void
  notify: (text: string, opts?: { undo?: boolean }) => void
}

const Ctx = createContext<AppContextValue>({
  revision: 0,
  canEdit: false,
  editingBy: null,
  needsNewerApp: false,
  terms: DEFAULT_TERMS,
  showError: () => undefined,
  notify: () => undefined
})

export function AppContextProvider({
  revision,
  canEdit,
  editingBy,
  needsNewerApp = false,
  showError,
  notify,
  children
}: {
  revision: number
  canEdit: boolean
  editingBy: string | null
  needsNewerApp?: boolean
  showError: (message: string) => void
  notify: (text: string, opts?: { undo?: boolean }) => void
  children: ReactNode
}): React.JSX.Element {
  const [terms, setTerms] = useState<Terminology>(DEFAULT_TERMS)
  useEffect(() => {
    let cancelled = false
    void window.api.rpc('terms.get', {}).then((r) => {
      if (!cancelled && r.ok) setTerms(r.value)
    })
    return () => {
      cancelled = true
    }
  }, [revision])
  return (
    <Ctx.Provider value={{ revision, canEdit, editingBy, needsNewerApp, terms, showError, notify }}>
      {children}
    </Ctx.Provider>
  )
}

export const useRevision = (): number => useContext(Ctx).revision
export const useCanEdit = (): boolean => useContext(Ctx).canEdit
/** "Hannah on OFFICE-PC" while someone else edits the file; null when this computer can edit. */
export const useEditingBy = (): string | null => useContext(Ctx).editingBy

/** Why codes and letters are unavailable, for the line under their buttons. */
export function useLockedReason(): string {
  const { editingBy, needsNewerApp } = useContext(Ctx)
  return needsNewerApp
    ? 'Codes and letters are locked because this file needs a newer Locker Manager. Update it (Help, Check for updates) to use them.'
    : `Codes and letters are locked while ${editingBy ?? 'someone else'} edits the file. Ask them to look it up, or wait until they close it.`
}
export const useTerms = (): Terminology => useContext(Ctx).terms
export const useNotify = (): ((text: string, opts?: { undo?: boolean }) => void) =>
  useContext(Ctx).notify
export const useShowError = (): ((message: string) => void) => useContext(Ctx).showError

/** Runs a change; reports a refusal through the app's error dialog. Resolves true on success. */
export function useAction(): <T>(fn: () => Promise<T>) => Promise<T | undefined> {
  const showError = useShowError()
  return async (fn) => {
    try {
      return await fn()
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error))
      return undefined
    }
  }
}
