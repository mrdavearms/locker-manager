import { useCallback, useEffect, useState } from 'react'
import { Info, Search, UserRound } from 'lucide-react'
import type { QuickResult } from '@shared/history'
import type { OperatorInfo } from '@shared/ipc'
import { AboutDialog } from './components/AboutDialog'
import { BackupsDialog } from './components/BackupsDialog'
import { Button } from './components/Button'
import { ConflictDialog } from './components/ConflictDialog'
import { DemoBadge } from './components/DemoBadge'
import { LockerMark } from './components/LockerMark'
import { Modal } from './components/Modal'
import { NavRail, type Screen } from './components/NavRail'
import { NewFileDialog } from './components/NewFileDialog'
import { OperatorDialog } from './components/OperatorDialog'
import { QuickFind } from './components/QuickFind'
import { StatusBar } from './components/StatusBar'
import { UpdateBanner } from './components/UpdateBanner'
import { ImportWizard } from './import/ImportWizard'
import { AppContextProvider } from './lib/appContext'
import { useAppInfo } from './lib/useAppInfo'
import { useFileState } from './lib/useFileState'
import { useUpdateStatus } from './lib/useUpdateStatus'
import { AllocateScreen } from './lockers/AllocateScreen'
import { PrintLabelsScreen } from './print/PrintLabelsScreen'
import { LettersScreen } from './letters/LettersScreen'
import { ReportsScreen } from './reports/ReportsScreen'
import type { LockerIntent } from './lockers/LockerActions'
import { HistoryScreen } from './screens/HistoryScreen'
import { HomeScreen } from './screens/HomeScreen'
import { LockersScreen } from './screens/LockersScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { SetupWizard } from './screens/SetupWizard'
import { StudentsScreen } from './screens/StudentsScreen'
import { WelcomeScreen } from './screens/WelcomeScreen'

interface Finder {
  title: string
  intent: LockerIntent
}

const FIND_TITLES: Record<NonNullable<LockerIntent> | 'find', string> = {
  find: 'Find a student or locker',
  assign: 'Who is the new student?',
  leave: 'Who has left?',
  recode: 'Whose code needs changing?',
  move: 'Who is moving?',
  swap: 'Who is swapping?'
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return (
    !!el &&
    (el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.tagName === 'SELECT' ||
      el.isContentEditable)
  )
}

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
  const [finder, setFinder] = useState<Finder | null>(null)
  // The screen belongs to the open file: a different (or no) file starts on Home.
  const [nav, setNav] = useState<{
    path: string | null
    screen: Screen
    focus: { studentId?: string; lockerId?: string; intent: LockerIntent; n: number } | null
  }>({
    path: null,
    screen: 'home',
    focus: null
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
  const focus = nav.path === openPath ? nav.focus : null
  const setScreen = useCallback(
    (next: Screen) => setNav({ path: openPath, screen: next, focus: null }),
    [openPath]
  )

  // Ctrl+K to find; Ctrl+Z and Ctrl+Shift+Z to undo and redo, except while typing
  // (where they undo the typing). Cmd on a Mac.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!openPath || !(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === 'k') {
        e.preventDefault()
        setFinder({ title: FIND_TITLES.find, intent: null })
      } else if (k === 'z' && !isTyping(e.target)) {
        e.preventDefault()
        void (e.shiftKey ? window.api.redo() : window.api.undo()).then(
          (r) => !r.ok && setError(r.message)
        )
      } else if (k === 'y' && !isTyping(e.target)) {
        e.preventDefault()
        void window.api.redo().then((r) => !r.ok && setError(r.message))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openPath])

  const onFound = (r: QuickResult): void => {
    const intent = finder?.intent ?? null
    setFinder(null)
    // A locker found with no task in mind opens the locker; otherwise its holder.
    const wantsStudent = r.kind === 'student' || intent !== null
    if (r.studentId && wantsStudent)
      setNav({
        path: openPath,
        screen: 'students',
        focus: { studentId: r.studentId, intent, n: Date.now() }
      })
    else if (r.lockerId)
      setNav({
        path: openPath,
        screen: 'lockers',
        focus: { lockerId: r.lockerId, intent: null, n: Date.now() }
      })
  }

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
          {open && (
            <button
              onClick={() => setFinder({ title: FIND_TITLES.find, intent: null })}
              className="hidden items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm text-ink-muted hover:bg-surface-muted md:inline-flex"
              data-testid="open-find"
            >
              <Search size={15} aria-hidden /> Find
              <kbd className="rounded bg-surface-muted px-1.5 text-xs">
                {navigator.platform.toLowerCase().includes('mac') ? '⌘K' : 'Ctrl K'}
              </kbd>
            </button>
          )}
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
              <span className="hidden text-ink-muted lg:inline">on {operator.machine}</span>
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
                screen === 'students' ? (
                  <StudentsScreen
                    key={focus?.n ?? 'students'}
                    onImport={() => setScreen('import')}
                    focus={
                      focus?.studentId ? { studentId: focus.studentId, intent: focus.intent } : null
                    }
                  />
                ) : screen === 'import' ? (
                  <ImportWizard onClose={() => setScreen('students')} />
                ) : screen === 'lockers' ? (
                  <LockersScreen
                    key={focus?.n ?? 'lockers'}
                    onSetUp={() => setScreen('setup')}
                    onAllocate={() => setScreen('allocate')}
                    focusLockerId={focus?.lockerId ?? null}
                  />
                ) : screen === 'allocate' ? (
                  <AllocateScreen onDone={() => setScreen('lockers')} />
                ) : screen === 'history' ? (
                  <HistoryScreen state={open} />
                ) : screen === 'print' ? (
                  <PrintLabelsScreen onSettings={() => setScreen('settings-labels')} />
                ) : screen === 'letters' ? (
                  <LettersScreen onDesign={() => setScreen('settings-letters')} />
                ) : screen === 'reports' ? (
                  <ReportsScreen />
                ) : screen === 'settings' ? (
                  <SettingsScreen />
                ) : screen === 'settings-labels' ? (
                  <SettingsScreen initialTab="labels" />
                ) : screen === 'settings-letters' ? (
                  <SettingsScreen initialTab="letters" />
                ) : screen === 'setup' ? (
                  <SetupWizard onFinish={() => setScreen('home')} />
                ) : (
                  <HomeScreen
                    state={open}
                    onError={setError}
                    onNavigate={setScreen}
                    onFind={(intent) => setFinder({ title: FIND_TITLES[intent ?? 'find'], intent })}
                  />
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
        {open && finder && (
          <QuickFind open title={finder.title} onClose={() => setFinder(null)} onPick={onFound} />
        )}
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
            if (state.status === 'open') setNav({ path: state.path, screen: 'setup', focus: null })
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
