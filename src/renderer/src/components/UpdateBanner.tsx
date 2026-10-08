import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, Loader2, RefreshCw } from 'lucide-react'
import type { UpdateStatus } from '@shared/ipc'
import { cn } from '@renderer/lib/cn'
import { Button } from './Button'

interface Props {
  status: UpdateStatus
}

/**
 * One line that says what the updater is doing, in plain words, with the one
 * button that makes sense. Quiet when there is nothing to do.
 */
export function UpdateBanner({ status }: Props): React.JSX.Element | null {
  const [installMessage, setInstallMessage] = useState<string | null>(null)

  const install = async (): Promise<void> => {
    const result = await window.api.installUpdate()
    setInstallMessage(result.started ? null : (result.reason ?? 'The update could not start.'))
  }

  const tone = (t: 'info' | 'good' | 'warn' | 'bad'): string =>
    cn(
      'flex items-center gap-3 rounded-xl border px-4 py-3 text-sm',
      t === 'info' && 'bg-brand-soft border-brand/20 text-ink',
      t === 'good' && 'bg-good-soft border-good/30 text-ink',
      t === 'warn' && 'bg-warn-soft border-warn/30 text-ink',
      t === 'bad' && 'bg-bad-soft border-bad/30 text-ink'
    )

  switch (status.state) {
    case 'idle':
      return null
    case 'checking':
      return status.manual ? (
        <div role="status" className={tone('info')} data-testid="update-banner">
          <Loader2 className="animate-spin" size={18} /> Checking for updates…
        </div>
      ) : null
    case 'up-to-date':
      return (
        <div role="status" className={tone('good')} data-testid="update-banner">
          <CheckCircle2 size={18} /> You have the latest version ({status.version}).
        </div>
      )
    case 'available':
      return (
        <div role="status" className={tone('info')} data-testid="update-banner">
          <Download size={18} />
          <span className="flex-1">
            Version {status.version} is available.
            {status.mode === 'manual-download'
              ? ` ${status.manualReason ?? 'This copy cannot update itself, so download the new version from the download page and install it over the top.'}`
              : status.atStartup
                ? ' Downloading it now. Locker Manager restarts by itself when it is ready.'
                : ' It is downloading in the background.'}
          </span>
          {status.mode === 'manual-download' && (
            <Button size="sm" onClick={() => void window.api.openDownloadPage()}>
              Open the download page
            </Button>
          )}
          {status.atStartup && <SkipButton />}
        </div>
      )
    case 'downloading':
      return (
        <div role="status" className={tone('info')} data-testid="update-banner">
          <Loader2 className="animate-spin" size={18} />
          <span className="flex-1">
            Downloading version {status.version}… {status.percent}%
            {status.atStartup ? ' Locker Manager restarts by itself when it is ready.' : ''}
          </span>
          <div className="h-2 w-40 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
            <div className="h-full bg-brand" style={{ width: `${status.percent}%` }} />
          </div>
          {status.atStartup && <SkipButton />}
        </div>
      )
    case 'ready':
      if (status.atStartup) {
        return (
          <div role="status" className={tone('good')} data-testid="update-banner">
            <Loader2 className="animate-spin" size={18} />
            <span className="flex-1">
              Restarting to finish installing version {status.version}…
            </span>
          </div>
        )
      }
      return (
        <div role="status" className={tone('good')} data-testid="update-banner">
          <RefreshCw size={18} />
          <span className="flex-1">
            Version {status.version} is ready. Restart now, or it installs when you next close the
            app.
            {installMessage ? ` ${installMessage}` : ''}
          </span>
          <Button size="sm" onClick={() => void install()}>
            Restart and update
          </Button>
        </div>
      )
    case 'error':
      if (!status.manual) return null
      return (
        <div role="alert" className={tone('bad')} data-testid="update-banner">
          <AlertTriangle size={18} />
          <span className="flex-1">Could not check for updates: {status.message}</span>
          <Button size="sm" variant="secondary" onClick={() => void window.api.openDownloadPage()}>
            Open the download page
          </Button>
        </div>
      )
  }
}

/** Carry on now; the update still downloads and installs when the app next closes. */
function SkipButton(): React.JSX.Element {
  return (
    <Button
      size="sm"
      variant="secondary"
      title="Keep working now. The update installs when you next close Locker Manager."
      onClick={() => void window.api.skipStartupUpdate()}
    >
      Skip for now
    </Button>
  )
}
