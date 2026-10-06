import { useEffect, useState } from 'react'
import type { FileState } from '@shared/fileState'

export type OpenFileState = Extract<FileState, { status: 'open' }>

export function useFileState(): FileState | null {
  const [state, setState] = useState<FileState | null>(null)
  useEffect(() => {
    let cancelled = false
    void window.api.getFileState().then((s) => {
      if (!cancelled) setState(s)
    })
    const off = window.api.onFileState(setState)
    return () => {
      cancelled = true
      off()
    }
  }, [])
  return state
}
