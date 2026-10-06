import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { DEFAULT_TERMS, type Terminology } from '@shared/terminology'

interface AppContextValue {
  revision: number
  canEdit: boolean
  terms: Terminology
  showError: (message: string) => void
}

const Ctx = createContext<AppContextValue>({
  revision: 0,
  canEdit: false,
  terms: DEFAULT_TERMS,
  showError: () => undefined
})

export function AppContextProvider({
  revision,
  canEdit,
  showError,
  children
}: {
  revision: number
  canEdit: boolean
  showError: (message: string) => void
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
  return <Ctx.Provider value={{ revision, canEdit, terms, showError }}>{children}</Ctx.Provider>
}

export const useRevision = (): number => useContext(Ctx).revision
export const useCanEdit = (): boolean => useContext(Ctx).canEdit
export const useTerms = (): Terminology => useContext(Ctx).terms
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
