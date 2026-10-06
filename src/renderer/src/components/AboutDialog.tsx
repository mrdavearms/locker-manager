import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { AppInfo } from '@shared/ipc'
import { Button } from './Button'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  info: AppInfo | null
}

export function AboutDialog({ open, onOpenChange, info }: Props): React.JSX.Element {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby="about-description"
          className="card fixed left-1/2 top-1/2 w-[min(520px,92vw)] -translate-x-1/2 -translate-y-1/2 p-6 focus:outline-none"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-xl font-semibold">
                About {info?.name ?? 'Locker Manager'}
              </Dialog.Title>
              <Dialog.Description id="about-description" className="mt-1 text-sm text-ink-muted">
                Free and open source, for any school.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                className="rounded-md p-1 text-ink-muted hover:bg-surface-muted"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-ink-muted">Version</dt>
            <dd data-testid="about-version" className="font-mono">
              {info?.version ?? '…'}
            </dd>
            <dt className="text-ink-muted">Licence</dt>
            <dd>{info?.licence ?? '…'}</dd>
            <dt className="text-ink-muted">Platform</dt>
            <dd>
              {info ? `${platformName(info.platform)} (${info.arch})` : '…'}
              {info?.packaged === false ? ' · development build' : ''}
            </dd>
            <dt className="text-ink-muted">Signed</dt>
            <dd>{info ? (info.signed ? 'Yes' : 'No (unsigned build)') : '…'}</dd>
            <dt className="text-ink-muted">Electron</dt>
            <dd className="font-mono">{info?.electron ?? '…'}</dd>
          </dl>

          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => info && void window.api.openExternal(info.repoUrl)}
            >
              Source code on GitHub
            </Button>
            <Button variant="secondary" onClick={() => void window.api.checkForUpdates()}>
              Check for updates
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function platformName(p: AppInfo['platform']): string {
  if (p === 'darwin') return 'macOS'
  if (p === 'win32') return 'Windows'
  return 'Linux'
}
