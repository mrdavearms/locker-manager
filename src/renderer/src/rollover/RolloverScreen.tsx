import { useState } from 'react'
import {
  Archive,
  ArrowRight,
  CalendarRange,
  Check,
  FileDown,
  KeyRound,
  Printer,
  ShieldCheck,
  Upload,
  Users
} from 'lucide-react'
import type { RolloverStatus, SelfResetGroup } from '@shared/rollover'
import { Banner } from '@renderer/components/Banner'
import { Button } from '@renderer/components/Button'
import { Select, TextInput } from '@renderer/components/Field'
import type { Screen } from '@renderer/components/NavRail'
import { useAction, useCanEdit, useTerms } from '@renderer/lib/appContext'
import { cn } from '@renderer/lib/cn'
import { plural } from '@renderer/lib/format'
import { call, useRpc } from '@renderer/lib/rpc'

// SPEC.md 4.10: a guided, reversible move to next year. Progress lives in the data
// file, so anyone can carry on where someone else stopped.

type StepId =
  | 'checklist'
  | 'record'
  | 'check'
  | 'archive'
  | 'promote'
  | 'import'
  | 'codes'
  | 'allocate'
  | 'print'
  | 'resets'

const STEPS: { id: StepId; title: string; after: boolean }[] = [
  { id: 'checklist', title: 'Before the last day', after: false },
  { id: 'record', title: 'Record locks students reset', after: false },
  { id: 'check', title: 'Check everything', after: false },
  { id: 'archive', title: 'Archive this year', after: false },
  { id: 'promote', title: 'Move students up (optional)', after: true },
  { id: 'import', title: 'Import next year’s students', after: true },
  { id: 'codes', title: 'Codes for next year', after: true },
  { id: 'allocate', title: 'Give out lockers', after: true },
  { id: 'print', title: 'Print labels and letters', after: true },
  { id: 'resets', title: 'Reset the remaining locks', after: true }
]

function GroupReset({ g }: { g: SelfResetGroup }): React.JSX.Element {
  const act = useAction()
  const canEdit = useCanEdit()
  const [notDone, setNotDone] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState(false)
  const done = g.locks.filter((l) => !notDone.has(l.lockId))
  return (
    <li className="rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="flex-1 text-left font-semibold"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          {g.display}{' '}
          <span className="font-normal text-ink-muted">· {plural(g.locks.length, 'lock')}</span>
        </button>
        <Button
          size="sm"
          disabled={!canEdit || done.length === 0}
          data-testid={`self-reset-${g.group}`}
          onClick={() =>
            void act(() => call('rollover.recordOnZero', { lockIds: done.map((l) => l.lockId) }))
          }
        >
          <Check size={15} aria-hidden /> {done.length === g.locks.length ? 'All' : done.length} on
          0 0 0 0
        </Button>
      </div>
      {open && (
        <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {g.locks.map((l) => (
            <li key={l.lockId}>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!notDone.has(l.lockId)}
                  onChange={(e) => {
                    const next = new Set(notDone)
                    if (e.target.checked) next.delete(l.lockId)
                    else next.add(l.lockId)
                    setNotDone(next)
                  }}
                />
                <span className="tabular-nums text-ink-muted">{l.locker}</span> {l.student}
              </label>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function Fact({ ok, children }: { ok: boolean; children: React.ReactNode }): React.JSX.Element {
  return (
    <li className="flex gap-3">
      <span
        className={cn(
          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full',
          ok ? 'bg-good text-white' : 'bg-warn-soft text-warn'
        )}
        aria-hidden
      >
        {ok ? <Check size={13} /> : '!'}
      </span>
      <span>{children}</span>
    </li>
  )
}

function StepBody({
  step,
  s,
  onNavigate
}: {
  step: StepId
  s: RolloverStatus
  onNavigate: (screen: Screen) => void
}): React.JSX.Element {
  const terms = useTerms()
  const act = useAction()
  const canEdit = useCanEdit()
  const { data: groups } = useRpc('rollover.selfResetGroups', {})
  const { data: yearGroups } = useRpc('groups.list', {})
  const [typed, setTyped] = useState('')
  const [lastYear, setLastYear] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const confirm = `START ${s.nextYear}`
  const years = [...new Set((yearGroups ?? []).map((g) => g.yearLevel).filter(Boolean))]
    .map(Number)
    .filter((n) => Number.isInteger(n))
    .sort((a, b) => a - b)

  switch (step) {
    case 'checklist':
      return (
        <div className="space-y-4">
          <p>
            Resetting hundreds of locks one by one with the master key takes a full day. It is much
            quicker to ask students to reset their own lock to <strong>0 0 0 0</strong> in{' '}
            {terms.group.one.toLowerCase()} on their last day, with a teacher ticking each one off.
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Print the end-of-year reset checklist: one page per {terms.group.one.toLowerCase()}.
            </li>
            <li>On the last day, students empty their locker and turn every dial to 0 0 0 0.</li>
            <li>The teacher checks each lock opens on 0 0 0 0 and ticks it.</li>
            <li>Collect the sheets, then record them in the next step.</li>
          </ol>
          <Button
            onClick={() =>
              void act(async () => {
                const r = await window.api.reportPdf({
                  request: { id: 'self_reset', group: null, since: null, includeCodes: false }
                })
                if (r.ok) setResult(`Saved: ${r.path ?? ''}`)
                else if (!r.cancelled) throw new Error(r.message)
              })
            }
          >
            <FileDown size={17} aria-hidden /> Save the reset checklist as PDF…
          </Button>
          {result && <p className="text-sm text-ink-muted">{result}</p>}
        </div>
      )
    case 'record':
      return (
        <div className="space-y-4">
          <p>
            For each {terms.group.one.toLowerCase()}, untick any lock that was <em>not</em> reset,
            then click the button. Those locks now have no code: next year’s student sets their new
            code themselves. Locks you do not record here go on the Locks to reset list after the
            archive.
          </p>
          {groups && groups.length === 0 ? (
            <Banner tone="info" title="Nothing left to record">
              Every lock with a code has been recorded as reset, or there are none.
            </Banner>
          ) : (
            <ul className="space-y-2">
              {groups?.map((g) => (
                <GroupReset key={g.group} g={g} />
              ))}
            </ul>
          )}
        </div>
      )
    case 'check':
      return (
        <ul className="space-y-3">
          <Fact ok={s.lettersNotPrinted === 0}>
            {s.lettersNotPrinted === null
              ? 'No letters have been printed this year.'
              : s.lettersNotPrinted === 0
                ? 'Every letter has been printed.'
                : `${plural(s.lettersNotPrinted, 'letter')} for new lockers or codes not printed yet. That matters less now the year is ending.`}
          </Fact>
          <Fact ok={s.locksWithKnownCodes === 0}>
            {s.locksWithKnownCodes === 0
              ? 'No lock still has a student’s code.'
              : `${plural(s.locksWithKnownCodes, 'lock')} still on a student’s code. They go on the Locks to reset list after the archive.`}
          </Fact>
          <Fact ok>
            A backup called “Before starting {s.nextYear}” is kept before anything changes.
          </Fact>
          <Fact ok>
            The archive can be undone straight away with Undo, or later by restoring that backup.
          </Fact>
        </ul>
      )
    case 'archive':
      return s.archived ? (
        <Banner tone="info" title={`${s.currentYear ?? s.nextYear} has started`}>
          The old year is archived. Carry on with the next steps.
        </Banner>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-bad/40 bg-bad-soft p-4">
            <p className="font-semibold">This is the big step.</p>
            <p className="mt-1">
              It will end {plural(s.assignments, 'student’s locker', 'students’ lockers')}, put{' '}
              {plural(s.locksWithKnownCodes, 'lock')} on the Locks to reset list, archive{' '}
              {s.currentYear} as read-only history, and start {s.nextYear}. A backup is kept first.
            </p>
          </div>
          <label className="block text-sm">
            <span className="block font-semibold">Type {confirm} to confirm</span>
            <TextInput
              className="mt-1.5 max-w-xs"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              data-testid="rollover-confirm"
              autoComplete="off"
            />
          </label>
          <Button
            variant="danger"
            disabled={!canEdit || typed.trim().toUpperCase() !== confirm.toUpperCase()}
            data-testid="rollover-archive"
            onClick={() =>
              void act(async () => {
                const b = await window.api.namedBackup(`Before starting ${s.nextYear}`)
                if (!b.ok)
                  throw new Error(`No backup could be kept, so nothing was changed. ${b.message}`)
                const r = await call('rollover.archive', { typed })
                setResult(
                  `${r.toYear} has started. ${plural(r.ended, 'locker')} given back; ${plural(r.needReset, 'lock')} to reset.${b.warning ? ` ${b.warning}` : ''}`
                )
              })
            }
          >
            <Archive size={17} aria-hidden /> Archive {s.currentYear} and start {s.nextYear}
          </Button>
          {result && <p className="text-sm">{result}</p>}
        </div>
      )
    case 'promote':
      return s.promoted ? (
        <Banner tone="info" title="Students moved up">
          Every student has moved up a {terms.yearLevel.one.toLowerCase()}.
        </Banner>
      ) : (
        <div className="space-y-4">
          <p>
            <strong>Most schools skip this</strong> and import next year’s students instead, after
            the student system rolls over (usually late January).
          </p>
          <p>
            If your school keeps the same students, move everyone up one{' '}
            {terms.yearLevel.one.toLowerCase()} now. Students in the last{' '}
            {terms.yearLevel.one.toLowerCase()} are marked as left. {terms.group.many} stay as they
            are until the next import.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="block font-semibold">Last {terms.yearLevel.one.toLowerCase()}</span>
              <Select
                className="mt-1.5 w-40"
                value={lastYear}
                onChange={(e) => setLastYear(e.target.value)}
              >
                <option value="">Choose…</option>
                {[...new Set([...years, 12])]
                  .sort((a, b) => a - b)
                  .map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
              </Select>
            </label>
            <Button
              variant="secondary"
              disabled={!canEdit || !s.archived || !lastYear}
              onClick={() =>
                void act(async () => {
                  const r = await call('rollover.promote', { lastYearLevel: lastYear })
                  setResult(
                    `${plural(r.promoted, 'student')} moved up; ${plural(r.left, 'student')} marked as left.`
                  )
                })
              }
            >
              <Users size={17} aria-hidden /> Move everyone up
            </Button>
          </div>
          {result && <p className="text-sm">{result}</p>}
        </div>
      )
    case 'import':
      return (
        <div className="space-y-4">
          <p>
            Import next year’s students from your student system, the same way as during the year.
            Students not in the import show as possible leavers for you to confirm.
          </p>
          <Button onClick={() => onNavigate('import')}>
            <Upload size={17} aria-hidden /> Import students <ArrowRight size={16} aria-hidden />
          </Button>
        </div>
      )
    case 'codes':
      return (
        <div className="space-y-4">
          <p>
            Next year’s code set gives every {terms.locker.one.toLowerCase()} a new code that is
            never the same as its old one, plus spares.
          </p>
          <ul className="space-y-3">
            <Fact ok={s.nextYearCodeSets > 0}>
              {s.nextYearCodeSets > 0
                ? `A code set for ${s.currentYear} is ready.`
                : `No code set for ${s.currentYear} yet.`}
            </Fact>
          </ul>
          <Button
            variant={s.nextYearCodeSets > 0 ? 'secondary' : 'primary'}
            disabled={!canEdit || !s.archived}
            data-testid="rollover-codes"
            onClick={() =>
              void act(() =>
                call('codes.sets.generate', {
                  name: `${s.currentYear ?? s.nextYear} codes`,
                  seed: null
                })
              )
            }
          >
            <KeyRound size={17} aria-hidden /> Make the code set
          </Button>
        </div>
      )
    case 'allocate':
      return (
        <div className="space-y-4">
          <p>
            Give out lockers by your allocation plan: check the draft, swap anyone, then commit.{' '}
            {s.studentsWithoutLocker > 0 &&
              `${plural(s.studentsWithoutLocker, 'student')} without a ${terms.locker.one.toLowerCase()} now.`}
          </p>
          <Button onClick={() => onNavigate('allocate')}>
            <CalendarRange size={17} aria-hidden /> Allocate {terms.locker.many.toLowerCase()}{' '}
            <ArrowRight size={16} aria-hidden />
          </Button>
        </div>
      )
    case 'print':
      return (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => onNavigate('print')}>
            <Printer size={17} aria-hidden /> Print labels
          </Button>
          <Button onClick={() => onNavigate('letters')}>
            <Printer size={17} aria-hidden /> Print letters
          </Button>
        </div>
      )
    case 'resets':
      return (
        <div className="space-y-4">
          <ul className="space-y-3">
            <Fact ok={s.resetsWaiting === 0}>
              {s.resetsWaiting === 0
                ? 'No locks are waiting for a reset.'
                : `${plural(s.resetsWaiting, 'lock')} waiting for a reset with the master key. They are listed on Home; the Locks to reset report is a printable tick list.`}
            </Fact>
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => onNavigate('home')}>
              See Locks to reset
            </Button>
            <Button
              disabled={!canEdit}
              data-testid="rollover-finish"
              onClick={() =>
                void act(() => call('rollover.finish', {}).then(() => onNavigate('home')))
              }
            >
              <ShieldCheck size={17} aria-hidden /> Finish
            </Button>
          </div>
        </div>
      )
  }
}

export function RolloverScreen({
  onNavigate
}: {
  onNavigate: (s: Screen) => void
}): React.JSX.Element {
  const act = useAction()
  const canEdit = useCanEdit()
  const { data: s } = useRpc('rollover.status', {})
  const [step, setStep] = useState<StepId | null>(null)
  if (!s) return <div className="px-6 py-8">Loading…</div>
  const current: StepId = step ?? (s.archived ? 'promote' : 'checklist')
  const index = STEPS.findIndex((x) => x.id === current)

  return (
    <div className="w-full space-y-6 px-6 py-8">
      <header>
        <h1 className="text-3xl font-semibold">Start next year</h1>
        <p className="mt-1 text-ink-muted">
          {s.archived
            ? `${s.currentYear} has started. Work through the rest at your own pace.`
            : `From ${s.currentYear ?? 'this year'} to ${s.nextYear}, one step at a time. Your progress is kept in the file, so anyone can carry on.`}
        </p>
      </header>

      {!s.started ? (
        <section className="card space-y-4 p-6" data-testid="rollover-intro">
          <h2 className="text-xl font-semibold">What happens</h2>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Students reset their own lock to 0 0 0 0 on their last day, and you record it.</li>
            <li>You archive this year. A backup is kept first, and you type a confirmation.</li>
            <li>You import next year’s students, make new codes, and give out lockers.</li>
            <li>You print labels and letters, and reset any locks still on an old code.</li>
          </ol>
          <p className="text-sm text-ink-muted">
            Nothing changes until step 2. You can stop at any point and come back later.
          </p>
          <Button
            disabled={!canEdit}
            data-testid="rollover-start"
            onClick={() => void act(() => call('rollover.start', {}))}
          >
            Begin <ArrowRight size={16} aria-hidden />
          </Button>
        </section>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <ol className="card space-y-1 p-3" aria-label="Steps">
            {STEPS.map((x, i) => {
              const done = s.archived ? !x.after || (x.id === 'promote' && s.promoted) : false
              const locked = x.after && !s.archived
              return (
                <li key={x.id}>
                  <button
                    disabled={locked}
                    onClick={() => setStep(x.id)}
                    aria-current={x.id === current ? 'step' : undefined}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm disabled:opacity-45',
                      x.id === current ? 'bg-panel text-on-panel' : 'hover:bg-surface-muted'
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                        done
                          ? 'bg-good text-white'
                          : x.id === current
                            ? 'bg-on-panel text-panel'
                            : 'border border-line-strong'
                      )}
                    >
                      {done ? <Check size={13} /> : i + 1}
                    </span>
                    {x.title}
                  </button>
                </li>
              )
            })}
          </ol>
          <section className="card p-6" aria-labelledby="step-title">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Step {index + 1} of {STEPS.length}
            </p>
            <h2 id="step-title" className="mt-1 text-2xl font-semibold">
              {STEPS[index]!.title}
            </h2>
            <div className="mt-5">
              <StepBody step={current} s={s} onNavigate={onNavigate} />
            </div>
            <div className="mt-8 flex justify-between border-t border-line pt-4">
              <Button
                variant="ghost"
                disabled={index === 0}
                onClick={() => setStep(STEPS[index - 1]!.id)}
              >
                Back
              </Button>
              {index < STEPS.length - 1 && (
                <Button
                  variant="secondary"
                  disabled={STEPS[index + 1]!.after && !s.archived}
                  data-testid="rollover-next"
                  onClick={() => setStep(STEPS[index + 1]!.id)}
                >
                  Next <ArrowRight size={16} aria-hidden />
                </Button>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
