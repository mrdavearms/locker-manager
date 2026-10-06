import { useEffect, useState } from 'react'
import type { UpdateStatus } from '@shared/ipc'

export function useUpdateStatus(): UpdateStatus {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle', mode: 'disabled' })
  useEffect(() => {
    let cancelled = false
    void window.api.getUpdateStatus().then((s) => {
      if (!cancelled) setStatus(s)
    })
    const off = window.api.onUpdateStatus(setStatus)
    return () => {
      cancelled = true
      off()
    }
  }, [])
  return status
}
