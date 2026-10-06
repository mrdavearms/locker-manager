import type { FileSummaryView, HistoryLineView } from '@shared/fileState'
import { describeAction, formatWhen, plural } from '@renderer/lib/format'
import { cn } from '@renderer/lib/cn'

interface Props {
  heading: string
  subheading: string
  summary: FileSummaryView | null
  onlyHere: HistoryLineView[]
  onlyHereLabel: string
  tone: 'brand' | 'accent'
}

/** One side of a comparison: what the version holds and what was done only in it. */
export function VersionCard({
  heading,
  subheading,
  summary,
  onlyHere,
  onlyHereLabel,
  tone
}: Props): React.JSX.Element {
  return (
    <section
      className={cn(
        'flex flex-col rounded-2xl border-2 bg-surface p-5',
        tone === 'brand' ? 'border-brand/40' : 'border-accent/40'
      )}
    >
      <p
        className={cn(
          'text-xs font-bold uppercase tracking-wider',
          tone === 'brand' ? 'text-brand' : 'text-accent'
        )}
      >
        {subheading}
      </p>
      <h3 className="mt-1 text-lg font-semibold">{heading}</h3>
      {summary ? (
        <>
          <p className="mt-2 text-sm text-ink-muted">
            {summary.schoolName} · {plural(summary.counts.students, 'student')} ·{' '}
            {plural(summary.counts.lockers, 'locker')}
          </p>
          {summary.lastChange && (
            <p className="mt-1 text-sm text-ink-muted">
              Last change: {describeAction(summary.lastChange.action).toLowerCase()} by{' '}
              {summary.lastChange.operator}, {formatWhen(summary.lastChange.at)}
            </p>
          )}
          <h4 className="mt-4 text-sm font-semibold">{onlyHereLabel}</h4>
          {onlyHere.length === 0 ? (
            <p className="mt-1 text-sm text-ink-muted">Nothing.</p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-sm">
              {onlyHere.slice(0, 8).map((h) => (
                <li key={h.id} className="flex gap-2">
                  <span className="shrink-0 text-ink-muted tabular-nums">{formatWhen(h.at)}</span>
                  <span>
                    {describeAction(h.action)}{' '}
                    <span className="text-ink-muted">({h.operator})</span>
                  </span>
                </li>
              ))}
              {onlyHere.length > 8 && (
                <li className="text-ink-muted">and {onlyHere.length - 8} more</li>
              )}
            </ul>
          )}
        </>
      ) : (
        <p className="mt-2 text-sm text-ink-muted">This version could not be read.</p>
      )}
    </section>
  )
}
