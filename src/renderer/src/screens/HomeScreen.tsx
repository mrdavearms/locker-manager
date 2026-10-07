import { useState } from 'react'
import { Check, Copy, PencilLine } from 'lucide-react'
import { Banner } from '@renderer/components/Banner'
import { ReadOnlyBanner } from '@renderer/components/ReadOnlyBanner'
import { Button } from '@renderer/components/Button'
import { DemoBadge } from '@renderer/components/DemoBadge'
import { TaskGrid } from '@renderer/components/TaskGrid'
import { ProblemsPanel } from '@renderer/components/ProblemsPanel'
import { GettingStarted } from '@renderer/onboarding/GettingStarted'
import type { Screen } from '@renderer/components/NavRail'
import { ResetList, type LockerIntent } from '@renderer/lockers/LockerActions'
import { plural } from '@renderer/lib/format'
import type { OpenFileState } from '@renderer/lib/useFileState'

interface Props {
  state: OpenFileState
  onError: (message: string) => void
}

function SchoolName({ state, onError }: Props): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(state.summary.schoolName)
  const canEdit = state.mode === 'edit' && !state.conflict
  const save = async (): Promise<void> => {
    const r = await window.api.renameSchool(name.trim())
    if (r.ok) setEditing(false)
    else onError(r.message)
  }
  if (editing) {
    return (
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <label htmlFor="rename-school" className="sr-only">
          School name
        </label>
        <input
          id="rename-school"
          autoFocus
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
          className="h-12 min-w-[18rem] flex-1 rounded-xl border border-white/30 bg-white/10 px-4 font-display text-2xl text-on-panel"
        />
        <Button variant="accent" type="submit" disabled={name.trim().length === 0}>
          <Check size={18} aria-hidden /> Save
        </Button>
        <Button
          variant="ghost"
          className="text-on-panel hover:bg-white/10"
          onClick={() => setEditing(false)}
        >
          Cancel
        </Button>
      </form>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <h1 data-testid="school-name" className="text-[2.2rem] font-semibold leading-tight">
        {state.summary.schoolName}
      </h1>
      {state.summary.demo && <DemoBadge onPanel />}
      {canEdit && (
        <button
          data-testid="rename-school"
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold opacity-80 hover:bg-white/10 hover:opacity-100"
          onClick={() => {
            setName(state.summary.schoolName)
            setEditing(true)
          }}
        >
          <PencilLine size={16} aria-hidden /> Rename
        </button>
      )}
    </div>
  )
}

export function HomeScreen({
  state,
  onError,
  onNavigate,
  onFind,
  onPrintResets,
  checklistHidden,
  onHideChecklist
}: Props & {
  onNavigate: (s: Screen) => void
  onFind: (intent: LockerIntent) => void
  onPrintResets: () => void
  /** The getting-started list was hidden on this computer. */
  checklistHidden: boolean
  onHideChecklist: () => void
}): React.JSX.Element {
  const c = state.summary.counts
  const stats = [
    { label: 'Lockers', value: c.lockers },
    { label: 'Students', value: c.students },
    { label: 'Have a locker', value: c.currentAssignments },
    { label: 'Changes in the history', value: c.historyEntries }
  ]
  const backupProblem = state.problems.find((p) => p.kind === 'backup_failed')
  const saveProblem = state.problems.find((p) => p.kind === 'save_failed')
  const lockProblem = state.problems.find((p) => p.kind === 'lock_failed')

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-8">
      <section className="relative overflow-hidden rounded-[28px] bg-panel px-8 py-7 text-on-panel shadow-[var(--shadow-lift)] animate-rise">
        <div
          className="perforated absolute inset-y-0 right-0 w-1/2 opacity-30 [mask-image:linear-gradient(to_left,black,transparent)]"
          aria-hidden
        />
        <div className="relative">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] opacity-75">
            Your school
          </p>
          <div className="mt-1.5">
            <SchoolName key={state.summary.schoolName} state={state} onError={onError} />
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-2xl bg-white/[0.08] px-4 py-3 ring-1 ring-white/10"
              >
                <dt className="text-sm opacity-80">{s.label}</dt>
                <dd className="stencil text-[2.4rem] leading-none tabular-nums">
                  {s.value.toLocaleString('en-AU')}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="space-y-3">
        <ReadOnlyBanner state={state} onError={onError} />
        {state.summary.demo && (
          <Banner tone="info" title="You are in the demo school">
            Every student here is made up. Practise freely: the demo starts fresh each time you open
            it.
          </Banner>
        )}
        {state.summary.practice && (
          <Banner tone="info" title="You are in a practice copy" testId="practice-banner">
            This is a copy of your school’s file on this computer only. Try anything: nothing you do
            here reaches the real file. Click Close file at the bottom to go back.
          </Banner>
        )}
        {state.locationWarning && (
          <Banner tone="warn" title="This might not be the shared file" testId="location-banner">
            {state.locationWarning}
          </Banner>
        )}
        {state.conflictCopies.length > 0 && (
          <Banner
            tone="warn"
            title={`Found ${plural(state.conflictCopies.length, 'copy', 'copies')} of this file`}
            testId="copies-banner"
          >
            Sync services make copies like these when two computers change a file at once. Compare
            each one and decide which to keep. Nothing is deleted without being kept as a backup.
            <ul className="mt-3 space-y-2">
              {state.conflictCopies.map((name) => (
                <li key={name} className="flex flex-wrap items-center gap-3">
                  <Copy size={16} className="text-warn" aria-hidden />
                  <span className="font-semibold text-ink">{name}</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      void window.api.compareCopy(name).then((r) => !r.ok && onError(r.message))
                    }
                  >
                    Compare
                  </Button>
                </li>
              ))}
            </ul>
          </Banner>
        )}
        {saveProblem && (
          <Banner tone="bad" title="Your latest changes are not saved yet" testId="save-problem">
            {saveProblem.message}
          </Banner>
        )}
        {backupProblem && (
          <Banner tone="warn" title="A backup could not be made">
            {backupProblem.message}
          </Banner>
        )}
        {lockProblem && (
          <Banner tone="warn" title="The edit lock could not be refreshed">
            {lockProblem.message}
          </Banner>
        )}
      </div>

      {!state.summary.demo &&
        !state.summary.practice &&
        state.mode === 'edit' &&
        !checklistHidden && (
          <GettingStarted state={state} onNavigate={onNavigate} onHide={onHideChecklist} />
        )}

      <TaskGrid
        handlers={{
          'Find a student': () => onFind(null),
          'Print labels': () => onNavigate('print'),
          'Print letters': () => onNavigate('letters'),
          ...(state.mode === 'edit'
            ? {
                'New student': () => onFind('assign'),
                'Student has left': () => onFind('leave'),
                'New code': () => onFind('recode'),
                'Move or swap': () => onFind('moveOrSwap'),
                'Import students': () => onNavigate('import'),
                'Start next year': () => onNavigate('rollover')
              }
            : {})
        }}
      />

      <ProblemsPanel onNavigate={onNavigate} />

      <ResetList onPrint={onPrintResets} />

      {!state.summary.demo && !state.summary.practice && (
        <section className="card flex flex-wrap items-center gap-4 p-5">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Practise without risk</h2>
            <p className="text-sm text-ink-muted">
              Make a copy of this file on this computer to train someone or try something out.
              Nothing done in the copy reaches the real file.
            </p>
          </div>
          <Button
            variant="secondary"
            data-testid="start-practice"
            onClick={() =>
              void window.api.practice().then((r) => !r.ok && !r.cancelled && onError(r.message))
            }
          >
            Practise on a copy
          </Button>
        </section>
      )}
    </div>
  )
}
