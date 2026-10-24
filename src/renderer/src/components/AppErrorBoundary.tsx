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

interface ScreenProps {
  children: ReactNode
  /** The screen being shown; choosing another screen clears the error. */
  screenKey: string
  onHome: () => void
}

/**
 * Catches a fault in one screen so the menu, status bar and dialogs stay, and staff
 * can move to another screen instead of reloading the whole window.
 */
export class ScreenErrorBoundary extends Component<ScreenProps, State> {
  override state: State = { message: null }

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : String(error) }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('screen error', error, info.componentStack)
  }

  override componentDidUpdate(previous: ScreenProps): void {
    if (previous.screenKey !== this.props.screenKey && this.state.message !== null) {
      this.setState({ message: null })
    }
  }

  override render(): ReactNode {
    if (this.state.message === null) return this.props.children
    return (
      <section className="p-6" role="alert">
        <div className="max-w-lg rounded-2xl bg-surface border border-line p-8 space-y-4">
          <h1 className="text-xl font-bold">This screen ran into a problem</h1>
          <p>
            Your school’s file is safe: {brand.name} saves every change as you go. Try the screen
            again, or choose another one from the menu. If this keeps happening, tell your IT team.
          </p>
          <p className="text-sm text-ink-muted break-words">{this.state.message}</p>
          <div className="flex gap-3">
            <Button onClick={() => this.setState({ message: null })}>Try again</Button>
            <Button variant="secondary" onClick={this.props.onHome}>
              Go to Home
            </Button>
          </div>
        </div>
      </section>
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
