import { useState } from 'react'
import { Check, ChevronLeft, ChevronRight, PartyPopper } from 'lucide-react'
import { Button } from '@renderer/components/Button'
import { useAction, useTerms } from '@renderer/lib/appContext'
import { call, useRpc } from '@renderer/lib/rpc'
import { cn } from '@renderer/lib/cn'
import { LocationsEditor } from '@renderer/settings/LocationsEditor'
import { LocksForm } from '@renderer/settings/LocksForm'
import { SchoolForm } from '@renderer/settings/SchoolForm'
import { TermsForm } from '@renderer/settings/TermsForm'

/**
 * SPEC.md 4.1: the first-run set-up. Each step saves as you go, so stopping half
 * way loses nothing; Home offers to carry on later.
 */
export function SetupWizard({ onFinish }: { onFinish: () => void }): React.JSX.Element {
  const terms = useTerms()
  const act = useAction()
  const { data: status } = useRpc('setup.status', {})
  const [step, setStep] = useState(0)
  const steps = [
    { title: 'Your school', body: <SchoolForm />, done: status?.hasSchoolDetails ?? false },
    { title: 'Words you use', body: <TermsForm />, done: status?.hasTerms ?? false },
    { title: terms.locker.many, body: <LocationsEditor />, done: (status?.lockers ?? 0) > 0 },
    {
      title: 'Locks',
      body: <LocksForm />,
      done: (status?.lockers ?? 0) > 0 && status?.lockersWithoutLock === 0
    },
    {
      title: 'Done',
      done: status?.completed ?? false,
      body: (
        <section className="card p-8 text-center animate-rise">
          <PartyPopper size={40} className="mx-auto text-accent" aria-hidden />
          <h2 className="mt-3 text-2xl font-semibold">Your school is set up</h2>
          <p className="mx-auto mt-2 max-w-lg text-ink-muted">
            Next: import your students, allocate {terms.locker.many.toLowerCase()} and issue codes,
            then print labels and letters. Those tasks arrive in the next updates of the app.
          </p>
          <ul className="mx-auto mt-6 max-w-sm space-y-2 text-left">
            {[
              ['School details', status?.hasSchoolDetails],
              ['Words your school uses', status?.hasTerms],
              [
                `${status?.lockers ?? 0} ${terms.locker.many.toLowerCase()}`,
                (status?.lockers ?? 0) > 0
              ],
              [
                'A lock for every locker',
                (status?.lockers ?? 0) > 0 && status?.lockersWithoutLock === 0
              ]
            ].map(([label, ok]) => (
              <li key={String(label)} className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex size-6 items-center justify-center rounded-full',
                    ok ? 'bg-good-soft text-good' : 'bg-surface-muted text-ink-muted'
                  )}
                >
                  {ok ? <Check size={14} /> : '·'}
                </span>
                {label}
                {!ok && <span className="text-sm text-ink-muted">(can be done later)</span>}
              </li>
            ))}
          </ul>
          <Button
            className="mt-8"
            size="lg"
            data-testid="setup-finish"
            onClick={() =>
              void act(async () => (await call('setup.complete', { done: true }), onFinish()))
            }
          >
            Finish set-up
          </Button>
        </section>
      )
    }
  ]
  const current = steps[step]!
  return (
    <div className="w-full space-y-6 px-6 py-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-ink-muted">
          Set up your school
        </p>
        <ol className="mt-3 flex flex-wrap items-center gap-2" aria-label="Steps">
          {steps.map((s, i) => (
            <li key={s.title} className="flex items-center gap-2">
              <button
                onClick={() => setStep(i)}
                aria-current={i === step ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors',
                  i === step
                    ? 'border-panel bg-panel text-on-panel'
                    : s.done
                      ? 'border-good/40 bg-good-soft text-good'
                      : 'border-line text-ink-muted hover:bg-surface-muted'
                )}
              >
                <span className="flex size-5 items-center justify-center rounded-full bg-black/10 text-xs">
                  {s.done && i !== step ? <Check size={12} /> : i + 1}
                </span>
                {s.title}
              </button>
              {i < steps.length - 1 && (
                <ChevronRight size={16} className="text-ink-muted" aria-hidden />
              )}
            </li>
          ))}
        </ol>
      </div>
      <div>{current.body}</div>
      <div className="flex justify-between">
        <Button variant="secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>
          <ChevronLeft size={18} aria-hidden /> Back
        </Button>
        {step < steps.length - 1 && (
          <Button data-testid="setup-next" onClick={() => setStep(step + 1)}>
            Next <ChevronRight size={18} aria-hidden />
          </Button>
        )}
      </div>
    </div>
  )
}
