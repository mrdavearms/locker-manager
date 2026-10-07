import { Check, ChevronRight, EyeOff } from 'lucide-react'
import { Button } from '@renderer/components/Button'
import type { Screen } from '@renderer/components/NavRail'
import { useTerms } from '@renderer/lib/appContext'
import { cn } from '@renderer/lib/cn'
import { useRpc } from '@renderer/lib/rpc'
import type { OpenFileState } from '@renderer/lib/useFileState'

/**
 * The first jobs for a new school, ticked off from what is really in the file.
 * Disappears once all are done, or when hidden on this computer.
 */
export function GettingStarted({
  state,
  onNavigate,
  onHide
}: {
  state: OpenFileState
  onNavigate: (s: Screen) => void
  onHide: () => void
}): React.JSX.Element | null {
  const terms = useTerms()
  const { data } = useRpc('setup.status', {})
  if (!data) return null
  const c = state.summary.counts
  const steps: {
    id: string
    title: string
    hint: string
    done: boolean
    go: Screen
    action: string
  }[] = [
    {
      id: 'setup',
      title: 'Set up your school',
      hint:
        data.lockers === 0
          ? `School details, the words your school uses, ${terms.locker.many.toLowerCase()} and locks.`
          : `${data.lockers} ${terms.locker.many.toLowerCase()} so far. Check the details, then finish.`,
      done: data.completed,
      go: 'setup',
      action: 'Carry on with set-up'
    },
    {
      id: 'import',
      title: 'Import your students',
      hint: 'From an export of your student system, such as Compass.',
      done: c.students > 0,
      go: 'import',
      action: 'Import students'
    },
    {
      id: 'allocate',
      title: `Give out ${terms.locker.many.toLowerCase()}`,
      hint: `Allocate a ${terms.locker.one.toLowerCase()} and a code to every student at once.`,
      done: c.currentAssignments > 0,
      go: 'allocate',
      action: `Allocate ${terms.locker.many.toLowerCase()}`
    },
    {
      id: 'labels',
      title: `Print ${terms.locker.one.toLowerCase()} labels`,
      hint: 'Print a test sheet on plain paper first to line up your printer.',
      done: data.labelsPrinted,
      go: 'print',
      action: 'Print labels'
    },
    {
      id: 'letters',
      title: 'Print the letters',
      hint: 'One page per student with their locker and code.',
      done: data.lettersPrinted,
      go: 'letters',
      action: 'Print letters'
    }
  ]
  const left = steps.filter((s) => !s.done)
  if (left.length === 0) return null
  const next = left[0]!

  return (
    <section
      className="card p-6"
      aria-labelledby="getting-started-heading"
      data-testid="getting-started"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="getting-started-heading" className="text-xl font-semibold">
            Getting started
          </h2>
          <p className="text-sm text-ink-muted">
            {steps.length - left.length} of {steps.length} done. Each step ticks itself off when it
            is done.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onHide} data-testid="hide-getting-started">
          <EyeOff size={15} aria-hidden /> Hide this list
        </Button>
      </div>
      <ol className="mt-4 divide-y divide-line">
        {steps.map((s, i) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center gap-4 py-3"
            data-testid={s.id === 'setup' && !s.done ? 'setup-card' : `getting-started-${s.id}`}
          >
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                s.done ? 'bg-good-soft text-good' : 'bg-surface-muted text-ink-muted'
              )}
              aria-hidden
            >
              {s.done ? <Check size={16} /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn('font-semibold', s.done && 'text-ink-muted line-through')}>
                {s.title}
                {s.done && <span className="sr-only"> (done)</span>}
              </p>
              {!s.done && <p className="text-sm text-ink-muted">{s.hint}</p>}
            </div>
            {!s.done && (
              <Button
                size="sm"
                variant={s === next ? 'primary' : 'secondary'}
                onClick={() => onNavigate(s.go)}
                data-testid={s.id === 'setup' ? 'open-setup' : `start-${s.id}`}
              >
                {s.action} <ChevronRight size={15} aria-hidden />
              </Button>
            )}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-sm text-ink-muted">
        Hidden this list by mistake? Open the Guide and click Show the getting-started list.
      </p>
    </section>
  )
}
