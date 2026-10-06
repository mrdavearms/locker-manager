import { useEffect, useState } from 'react'
import type { ComputerView } from '@shared/computer'

/** This computer's settings; also applies high contrast to the page. */
export function useComputer(): ComputerView | null {
  const [view, setView] = useState<ComputerView | null>(null)
  useEffect(() => {
    void window.api.getComputer().then(setView)
    return window.api.onComputerChanged(setView)
  }, [])
  useEffect(() => {
    if (view) document.documentElement.dataset.contrast = view.settings.contrast
  }, [view])
  return view
}
