import { useEffect, useState } from 'react'
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
  const [noticesOpen, setNoticesOpen] = useState(false)
  return (
    <>
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
          <Button variant="secondary" onClick={() => setNoticesOpen(true)}>
            Third-party software
          </Button>
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
      <Modal
        open={noticesOpen}
        onOpenChange={setNoticesOpen}
        title="Third-party software"
        description="Locker Manager is built with other people's free software. These are their licences."
        width="xl"
        testId="third-party-notices"
      >
        {noticesOpen && <NoticesText />}
      </Modal>
    </>
  )
}

/** Mounted only while the notices are open, so the 350 kB text is read when asked for. */
function NoticesText(): React.JSX.Element {
  const [text, setText] = useState<string | null | undefined>(undefined)
  const [chromiumProblem, setChromiumProblem] = useState(false)
  useEffect(() => {
    let live = true
    void window.api.thirdPartyNotices().then((r) => {
      if (live) setText(r.text)
    })
    return () => {
      live = false
    }
  }, [])
  return (
    <div className="space-y-4">
      {text === null ? (
        <p className="text-sm">
          The notices file is missing from this copy of the app. The same list is made by{' '}
          <span className="font-mono">npm run build</span> from the source code on GitHub.
        </p>
      ) : (
        <pre
          data-testid="third-party-text"
          tabIndex={0}
          aria-label="Licences of third-party software"
          className="max-h-[52vh] overflow-auto whitespace-pre-wrap rounded-lg bg-surface-muted p-4 font-mono text-xs"
        >
          {text ?? 'Loading…'}
        </pre>
      )}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {chromiumProblem && (
          <p className="text-sm text-ink-muted">Chromium's licences could not be opened.</p>
        )}
        <Button
          variant="secondary"
          onClick={() =>
            void window.api.openChromiumLicences().then((r) => setChromiumProblem(!r.ok))
          }
        >
          Chromium licences
        </Button>
      </div>
    </div>
  )
}

function platformName(p: AppInfo['platform']): string {
  if (p === 'darwin') return 'macOS'
  if (p === 'win32') return 'Windows'
  return 'Linux'
}
