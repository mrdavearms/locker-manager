import { useCallback, useEffect, useState } from 'react'
import { Info, UserRound } from 'lucide-react'
import type { OperatorInfo } from '@shared/ipc'
import { AboutDialog } from './components/AboutDialog'
import { BackupsDialog } from './components/BackupsDialog'
import { Button } from './components/Button'
import { ConflictDialog } from './components/ConflictDialog'
import { DemoBadge } from './components/DemoBadge'
import { LockerMark } from './components/LockerMark'
import { Modal } from './components/Modal'
import { NewFileDialog } from './components/NewFileDialog'
import { OperatorDialog } from './components/OperatorDialog'
import { StatusBar } from './components/StatusBar'
import { UpdateBanner } from './components/UpdateBanner'
import { useAppInfo } from './lib/useAppInfo'
import { useFileState } from './lib/useFileState'
import { useUpdateStatus } from './lib/useUpdateStatus'
import { NavRail, type Screen } from './components/NavRail'
import { AppContextProvider } from './lib/appContext'
import { HomeScreen } from './screens/HomeScreen'
import { LockersScreen } from './screens/LockersScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { SetupWizard } from './screens/SetupWizard'
import { WelcomeScreen } from './screens/WelcomeScreen'

export function App(): React.JSX.Element {
  const info = useAppInfo()
  const update = useUpdateStatus()
  const file = useFileState()
  const [operator, setOperator] = useState<OperatorInfo | null>(null)
  const [operatorOpen, setOperatorOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [backupsOpen, setBackupsOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The screen belongs to the open file: a different (or no) file starts on Home.
  const [nav, setNav] = useState<{ path: string | null; screen: Screen }>({
    path: null,
    screen: 'home'
  })

  const loadOperator = useCallback(() => {
    void window.api.getOperator().then((o) => {
      setOperator(o)
      if (o.name === null) setOperatorOpen(true)
    })
  }, [])
  useEffect(loadOperator, [loadOperator])
  useEffect(() => window.api.onOpenAbout(() => setAboutOpen(true)), [])

  const open = file?.status === 'open' ? file : null
  const openPath = open?.path ?? null
  const screen: Screen = nav.path === openPath ? nav.screen : 'home'
  const setScreen = useCallback(
    (next: Screen) => setNav({ path: openPath, screen: next }),
    [openPath]
  )

  return (
    <div className="grain flex min-h-full flex-col">
      <header className="border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-3">
          <LockerMark className="size-9" animate />
          <div className="flex-1">
            <p className="font-display text-lg font-semibold leading-tight">
              {info?.name ?? 'Locker Manager'}
            </p>
            {open && <p className="text-xs text-ink-muted">{open.summary.schoolName}</p>}
          </div>
          {open?.summary.demo && <DemoBadge />}
          {operator && (
            <button
              data-testid="operator-chip"
              onClick={() => setOperatorOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm hover:bg-surface-muted"
              title="Change your name"
            >
              <UserRound size={16} className="text-brand" aria-hidden />
              <span className="font-semibold">{operator.name ?? operator.suggested}</span>
              <span className="text-ink-muted">on {operator.machine}</span>
            </button>
          )}
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

      <AppContextProvider
        revision={open?.revision ?? 0}
        canEdit={open?.mode === 'edit' && !open.conflict}
        showError={setError}
      >
        <div className="flex flex-1">
          {open && <NavRail screen={screen} onNavigate={setScreen} />}
          <main className="min-w-0 flex-1">
            <div className="mx-auto max-w-6xl">
              {update.state !== 'idle' && (
                <div className="px-6 pt-6">
                  <UpdateBanner status={update} />
                </div>
              )}
              {file === null ? null : open ? (
                screen === 'lockers' ? (
                  <LockersScreen onSetUp={() => setScreen('setup')} />
                ) : screen === 'settings' ? (
                  <SettingsScreen />
                ) : screen === 'setup' ? (
                  <SetupWizard onFinish={() => setScreen('home')} />
                ) : (
                  <HomeScreen state={open} onError={setError} onNavigate={setScreen} />
                )
              ) : (
                <WelcomeScreen onNew={() => setNewOpen(true)} onError={setError} />
              )}
              {info && (
                <p className="pb-6 text-center text-xs text-ink-muted" data-testid="version-line">
                  Version {info.version}
                  {info.signed ? '' : ' · unsigned build'} · Free and open source · Your data never
                  leaves your school
                </p>
              )}
            </div>
          </main>
        </div>
      </AppContextProvider>

      {open && (
        <StatusBar
          state={open}
          onBackups={() => setBackupsOpen(true)}
          onClose={() => void window.api.closeFile()}
        />
      )}

      {open?.conflict && <ConflictDialog conflict={open.conflict} canEdit={open.mode === 'edit'} />}
      <BackupsDialog
        open={backupsOpen}
        onOpenChange={setBackupsOpen}
        canEdit={open?.mode === 'edit'}
      />
      <NewFileDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreate={async (name) => {
          const r = await window.api.newFile(name)
          if (r.ok) {
            setNewOpen(false)
            const state = await window.api.getFileState()
            if (state.status === 'open') setNav({ path: state.path, screen: 'setup' })
            return null
          }
          return r.cancelled ? null : r.message
        }}
      />
      <OperatorDialog
        open={operatorOpen}
        info={operator}
        required={operator?.name === null}
        onDone={() => {
          setOperatorOpen(false)
          loadOperator()
        }}
      />
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} info={info} />
      <Modal
        open={error !== null}
        onOpenChange={(o) => !o && setError(null)}
        title="That did not work"
        description="Nothing has been changed."
        testId="error-dialog"
      >
        <p data-testid="error-message">{error}</p>
        <div className="mt-6 flex justify-end">
          <Button onClick={() => setError(null)}>OK</Button>
        </div>
      </Modal>
    </div>
  )
}
