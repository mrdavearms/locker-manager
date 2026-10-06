import { AlertTriangle, CheckCircle2, CircleAlert } from 'lucide-react'
import type { ProblemScreen } from '@shared/problems'
import { useRpc } from '@renderer/lib/rpc'
import { Button } from './Button'

/** SPEC.md 10: everything that needs attention, each with a Fix button. */
export function ProblemsPanel({
  onNavigate
}: {
  onNavigate: (s: ProblemScreen) => void
}): React.JSX.Element | null {
  const { data: problems } = useRpc('problems.list', {})
  if (!problems) return null
  return (
    <section aria-labelledby="problems-heading" className="card p-5" data-testid="problems">
      <h2 id="problems-heading" className="flex items-center gap-2 text-lg font-semibold">
        {problems.length === 0 ? (
          <>
            <CheckCircle2 size={20} className="text-good" aria-hidden /> Nothing needs attention
          </>
        ) : (
          <>
            <AlertTriangle size={20} className="text-warn" aria-hidden /> Needs attention
          </>
        )}
      </h2>
      {problems.length > 0 && (
        <ul className="mt-3 divide-y divide-line">
          {problems.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-3 py-3"
              data-testid={`problem-${p.id}`}
            >
              <CircleAlert
                size={18}
                className={p.tone === 'bad' ? 'text-bad' : 'text-warn'}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{p.title}</p>
                <p className="text-sm text-ink-muted">{p.detail}</p>
              </div>
              {p.fix && (
                <Button size="sm" variant="secondary" onClick={() => onNavigate(p.fix!.screen)}>
                  {p.fix.label}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
