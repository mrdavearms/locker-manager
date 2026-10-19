import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react'
import { brand } from '@shared/brand'
import { Button } from './Button'

// A fault in the window's code used to leave a blank window with no way out
// (docs/audits/2026-10-20-stability-audit.md, start-up finding F3). The school's
// file is held and saved by the main process, so reloading the window loses nothing.

interface State {
  message: string | null
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { message: null }

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : String(error) }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('window error', error, info.componentStack)
  }

  override render(): ReactNode {
    if (this.state.message === null) return this.props.children
    return (
      <main className="min-h-screen bg-canvas text-ink grid place-items-center p-8">
        <div className="max-w-lg rounded-2xl bg-surface border border-line p-8 space-y-4">
          <h1 className="text-xl font-bold">Something went wrong in this window</h1>
          <p>
            Your school’s file is safe: {brand.name} saves every change as you go. Reload the window
            to carry on. If this keeps happening, tell your IT team.
          </p>
          <p className="text-sm text-ink-muted break-words">{this.state.message}</p>
          <Button onClick={() => window.location.reload()}>Reload the window</Button>
        </div>
      </main>
    )
  }
}

/** Tells the main process the app has drawn, once, so the start counts as good. */
export function MountedSignal(): null {
  useEffect(() => {
    window.api.appMounted()
  }, [])
  return null
}
