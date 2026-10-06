import { useEffect, useState } from 'react'
import { DoorClosed, Search, UserRound } from 'lucide-react'
import type { QuickResult } from '@shared/history'
import { useTerms } from '@renderer/lib/appContext'
import { cn } from '@renderer/lib/cn'
import { Modal } from './Modal'

/** Ctrl+K (Cmd+K on a Mac) from anywhere: a name, student ID, locker number, lock serial or key number (SPEC.md 4.11). */
export function QuickFind({
  open,
  title,
  onClose,
  onPick
}: {
  open: boolean
  title: string
  onClose: () => void
  onPick: (r: QuickResult) => void
}): React.JSX.Element {
  const terms = useTerms()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<QuickResult[]>([])
  const [active, setActive] = useState(0)
  useEffect(() => {
    let cancelled = false
    if (q.trim() === '') return
    void window.api.rpc('search.quick', { q }).then((r) => {
      if (!cancelled && r.ok) {
        setResults(r.value)
        setActive(0)
      }
    })
    return () => {
      cancelled = true
    }
  }, [q])
  const shown = q.trim() === '' ? [] : results
  const pick = (r: QuickResult | undefined): void => {
    if (!r) return
    setQ('')
    setResults([])
    onPick(r)
  }
  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={`Type a name, ${terms.studentId.one}, ${terms.locker.one.toLowerCase()} number, lock serial or key number.`}
      testId="quick-find"
    >
      <label className="relative block">
        <span className="sr-only">Search</span>
        <Search
          size={18}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted"
          aria-hidden
        />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, shown.length - 1))
            if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0))
            if (e.key === 'Enter') pick(shown[active])
          }}
          className="h-12 w-full rounded-xl border border-line-strong bg-surface pl-11 pr-3 text-base"
          data-testid="quick-find-input"
          role="combobox"
          aria-expanded={shown.length > 0}
          aria-controls="quick-find-results"
        />
      </label>
      <ul id="quick-find-results" role="listbox" className="mt-3 max-h-80 overflow-auto">
        {shown.map((r, i) => (
          <li key={`${r.kind}-${r.id}`} role="option" aria-selected={i === active}>
            <button
              onClick={() => pick(r)}
              onMouseEnter={() => setActive(i)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left',
                i === active && 'bg-brand-soft'
              )}
            >
              {r.kind === 'student' ? (
                <UserRound size={18} className="text-brand" aria-hidden />
              ) : (
                <DoorClosed size={18} className="text-accent" aria-hidden />
              )}
              <span>
                <span className="block font-semibold">{r.title}</span>
                <span className="block text-sm text-ink-muted">{r.subtitle}</span>
              </span>
            </button>
          </li>
        ))}
        {q.trim() !== '' && shown.length === 0 && (
          <li className="px-3 py-2 text-sm text-ink-muted">Nobody found.</li>
        )}
      </ul>
    </Modal>
  )
}
