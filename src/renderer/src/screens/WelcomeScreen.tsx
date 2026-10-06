import { useEffect, useState } from 'react'
import {
  ArrowRight,
  Clock3,
  FilePlus2,
  FolderOpen,
  GraduationCap,
  TriangleAlert,
  X
} from 'lucide-react'
import type { RecentFile } from '@shared/ipc'
import type { Managed } from '@shared/computer'
import { Button } from '@renderer/components/Button'
import { cn } from '@renderer/lib/cn'
import { LockerBank } from '@renderer/components/LockerBank'
import { formatWhen } from '@renderer/lib/format'

interface Props {
  onNew: () => void
  /** School IT's managed settings (SPEC.md 9.5). */
  managed?: Managed | undefined
  onError: (message: string) => void
}

export function WelcomeScreen({ onNew, onError, managed }: Props): React.JSX.Element {
  const [recent, setRecent] = useState<RecentFile[]>([])
  const [busy, setBusy] = useState(false)

  const refresh = (): void => {
    void window.api.recentFiles().then(setRecent)
  }
  useEffect(refresh, [])

  const act = async (
    fn: () => Promise<{ ok: boolean; cancelled?: boolean; message?: string }>
  ): Promise<void> => {
    setBusy(true)
    const r = await fn()
    setBusy(false)
    if (!r.ok && !r.cancelled && r.message) onError(r.message)
  }

  const choices = [
    {
      icon: FolderOpen,
      title: 'Open your school’s file',
      body: 'Most people start here. The file usually lives in a shared folder such as OneDrive.',
      action: () => void act(() => window.api.openFileDialog()),
      testId: 'open-file'
    },
    {
      icon: FilePlus2,
      title: 'Start a new school file',
      body: 'For the first person setting Locker Manager up for a school.',
      action: onNew,
      testId: 'new-file'
    },
    {
      icon: GraduationCap,
      title: 'Try the demo school',
      body: 'A made-up school with 228 lockers to practise on. Nothing you do there matters.',
      action: () => void act(() => window.api.openDemo()),
      testId: 'open-demo'
    }
  ].filter((c) => c.testId !== 'open-demo' || managed?.demoEnabled !== false)
  const itFile = managed?.defaultDataFile

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <section className="relative overflow-hidden rounded-[28px] bg-panel text-on-panel shadow-[var(--shadow-lift)]">
        <div className="perforated absolute inset-0 opacity-40" aria-hidden />
        <div className="relative grid items-center gap-8 p-10 md:grid-cols-[1.2fr_1fr]">
          <div className="animate-rise">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] opacity-80">
              Welcome to Locker Manager
            </p>
            <h1 className="mt-3 text-[2.6rem] font-semibold leading-[1.05]">
              Every locker, every code,
              <br />
              every student, in one place.
            </h1>
            <p className="mt-4 max-w-md text-[1.05rem] opacity-85">
              Allocate lockers, issue lock codes, print labels and letters, and keep it all right
              through the year. Your data stays in your school’s own folder.
            </p>
          </div>
          <LockerBank className="mx-auto w-full max-w-sm" />
        </div>
      </section>

      {itFile && (
        <div className="card mt-8 flex flex-wrap items-center gap-4 p-5" data-testid="it-file">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Your school’s file, set by your IT team</p>
            <p className="truncate text-sm text-ink-muted" title={itFile}>
              {itFile}
            </p>
          </div>
          <Button disabled={busy} onClick={() => void act(() => window.api.openFilePath(itFile))}>
            Open it
          </Button>
        </div>
      )}

      <ul
        className={cn(
          'stagger mt-8 grid gap-4',
          choices.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'
        )}
      >
        {choices.map(({ icon: Icon, title, body, action, testId }) => (
          <li key={title}>
            <button
              type="button"
              disabled={busy}
              onClick={action}
              data-testid={testId}
              className="card group flex h-full w-full flex-col items-start p-6 text-left transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] disabled:opacity-60"
            >
              <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
                <Icon size={24} aria-hidden />
              </span>
              <span className="mt-4 text-lg font-semibold font-display">{title}</span>
              <span className="mt-1 text-sm text-ink-muted">{body}</span>
              <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-semibold text-brand">
                Choose{' '}
                <ArrowRight
                  size={16}
                  className="transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </span>
            </button>
          </li>
        ))}
      </ul>

      <p className="mt-5 text-sm text-ink-muted">
        Have a portable export from Locker Manager?{' '}
        <button
          type="button"
          disabled={busy}
          className="font-semibold text-brand underline-offset-2 hover:underline"
          data-testid="file-from-export"
          onClick={() => void act(() => window.api.fileFromExport())}
        >
          Make a new file from it…
        </button>{' '}
        The workbook itself is never changed.
      </p>

      {recent.length > 0 && (
        <section className="mt-10 animate-rise" aria-labelledby="recent-heading">
          <h2 id="recent-heading" className="flex items-center gap-2 text-lg font-semibold">
            <Clock3 size={18} className="text-ink-muted" aria-hidden /> Opened recently on this
            computer
          </h2>
          <ul className="card mt-3 divide-y divide-line overflow-hidden" data-testid="recent-files">
            {recent.map((r) => (
              <li key={r.path} className="flex items-center gap-4 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{r.schoolName ?? r.fileName}</p>
                  <p className="truncate text-sm text-ink-muted" title={r.path}>
                    {r.fileName} in {r.folder} · opened {formatWhen(r.openedAt)}
                  </p>
                </div>
                {r.exists ? (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => void act(() => window.api.openFilePath(r.path))}
                  >
                    Open
                  </Button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm text-warn">
                    <TriangleAlert size={16} aria-hidden /> Not found
                  </span>
                )}
                <button
                  className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-muted"
                  aria-label={`Remove ${r.fileName} from this list`}
                  title="Remove from this list (the file is not deleted)"
                  onClick={() => void window.api.forgetRecent(r.path).then(refresh)}
                >
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
