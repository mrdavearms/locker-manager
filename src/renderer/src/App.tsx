import { useEffect, useState } from 'react'
import { Info, LockKeyhole } from 'lucide-react'
import { AboutDialog } from './components/AboutDialog'
import { Button } from './components/Button'
import { TaskGrid } from './components/TaskGrid'
import { UpdateBanner } from './components/UpdateBanner'
import { useAppInfo } from './lib/useAppInfo'
import { useUpdateStatus } from './lib/useUpdateStatus'

export function App(): React.JSX.Element {
  const info = useAppInfo()
  const status = useUpdateStatus()
  const [aboutOpen, setAboutOpen] = useState(false)

  useEffect(() => window.api.onOpenAbout(() => setAboutOpen(true)), [])

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-4">
          <span className="flex size-10 items-center justify-center rounded-xl bg-brand text-white dark:text-canvas">
            <LockKeyhole size={22} aria-hidden />
          </span>
          <div className="flex-1">
            <h1 className="text-lg font-semibold leading-tight">
              {info?.name ?? 'Locker Manager'}
            </h1>
            <p className="text-sm text-ink-muted">
              Student lockers, lock codes, labels and letters, all in one place.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAboutOpen(true)}
            data-testid="open-about"
          >
            <Info size={16} aria-hidden /> About
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-6 py-8">
        <UpdateBanner status={status} />

        <section className="card p-6" aria-labelledby="welcome-heading">
          <h2 id="welcome-heading" className="text-2xl font-semibold tracking-tight">
            Welcome
          </h2>
          <p className="mt-2 max-w-2xl text-ink-muted">
            This is the first, empty version of Locker Manager. It exists to prove that the app
            installs, runs and updates itself on Windows and Mac. The locker features arrive release
            by release.
          </p>
          {info && (
            <p className="mt-3 text-sm text-ink-muted" data-testid="version-line">
              Version {info.version}
              {info.signed ? '' : ' · unsigned build'}
            </p>
          )}
        </section>

        <TaskGrid />
      </main>

      <footer className="border-t border-line py-4 text-center text-xs text-ink-muted">
        Free and open source · MIT licence · Your data never leaves your school
      </footer>

      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} info={info} />
    </div>
  )
}
