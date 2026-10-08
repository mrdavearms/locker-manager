import type { AppInfo } from '@shared/ipc'
import { formatDateTime } from '@renderer/lib/format'
import { Button } from './Button'
import { LockerMark } from './LockerMark'
import { Modal } from './Modal'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  info: AppInfo | null
}

export function AboutDialog({ open, onOpenChange, info }: Props): React.JSX.Element {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`About ${info?.name ?? 'Locker Manager'}`}
      description="Free and open source, for any school."
    >
      <div className="flex items-start gap-5">
        <LockerMark className="size-16" animate={open} />
        <dl className="grid flex-1 grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-ink-muted">Version</dt>
          <dd data-testid="about-version" className="font-mono">
            {info?.version ?? '…'}
          </dd>
          <dt className="text-ink-muted">Build</dt>
          <dd data-testid="about-build" className="font-mono">
            {info?.commit ?? '…'}
          </dd>
          <dt className="text-ink-muted">Built on</dt>
          <dd data-testid="about-built">{info ? formatDateTime(info.builtAt) : '…'}</dd>
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
      </div>
      <div className="mt-7 flex flex-wrap justify-end gap-2">
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
    </Modal>
  )
}

function platformName(p: AppInfo['platform']): string {
  if (p === 'darwin') return 'macOS'
  if (p === 'win32') return 'Windows'
  return 'Linux'
}
