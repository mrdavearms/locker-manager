import { useMemo, useState } from 'react'
import { ArrowRight, ListChecks, Search, Sparkles, Wrench, X } from 'lucide-react'
import guideText from '../../../../docs/user-guide.md?raw'
import { Button } from '@renderer/components/Button'
import type { Screen } from '@renderer/components/NavRail'
import { cn } from '@renderer/lib/cn'
import { parseGuide, type Block, type Inline, type ListBlock } from '@shared/markdown'
import { SHOW_ME } from '@shared/guideLinks'

// SPEC.md 10: the user guide in the app, searchable, with a "Show me" button on
// each task that opens the right screen. The text is docs/user-guide.md itself.

const guide = parseGuide(guideText)

function InlineText({ parts }: { parts: Inline[] }): React.JSX.Element {
  return (
    <>
      {parts.map((p, i) =>
        p.kind === 'bold' ? (
          <strong key={i}>{p.text}</strong>
        ) : p.kind === 'em' ? (
          <em key={i}>{p.text}</em>
        ) : p.kind === 'code' ? (
          <code key={i} className="rounded bg-surface-muted px-1.5 py-0.5 text-[0.9em]">
            {p.text}
          </code>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  )
}

function ListView({ list }: { list: ListBlock }): React.JSX.Element {
  const Tag = list.kind
  return (
    <Tag className={cn('space-y-1.5 pl-6', list.kind === 'ol' ? 'list-decimal' : 'list-disc')}>
      {list.items.map((item, i) => (
        <li key={i}>
          <InlineText parts={item.text} />
          {item.children && (
            <div className="mt-1.5">
              <ListView list={item.children} />
            </div>
          )}
        </li>
      ))}
    </Tag>
  )
}

function Blocks({ blocks }: { blocks: Block[] }): React.JSX.Element {
  return (
    <div className="space-y-3 leading-relaxed">
      {blocks.map((b, i) =>
        b.kind === 'p' ? (
          <p key={i}>
            <InlineText parts={b.text} />
          </p>
        ) : (
          <ListView key={i} list={b} />
        )
      )}
    </div>
  )
}

/** Ways to go through the first-time help again. */
function StartAgain({
  onTour,
  onSetup,
  onShowChecklist
}: {
  onTour: () => void
  onSetup: (() => void) | null
  onShowChecklist: (() => void) | null
}): React.JSX.Element {
  return (
    <section className="card flex flex-wrap items-center gap-3 p-5" data-testid="help-start-again">
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold">New to Locker Manager, or need a reminder?</h2>
        <p className="text-sm text-ink-muted">
          Take the short tour again{onSetup ? ', go back through the set-up steps' : ''}
          {onShowChecklist ? ', or bring back the getting-started list on Home' : ''}.
        </p>
      </div>
      <Button size="sm" onClick={onTour} data-testid="help-tour">
        <Sparkles size={15} aria-hidden /> Take the tour
      </Button>
      {onSetup && (
        <Button size="sm" variant="secondary" onClick={onSetup} data-testid="help-setup">
          <Wrench size={15} aria-hidden /> Set-up steps
        </Button>
      )}
      {onShowChecklist && (
        <Button
          size="sm"
          variant="secondary"
          onClick={onShowChecklist}
          data-testid="help-checklist"
        >
          <ListChecks size={15} aria-hidden /> Show the getting-started list
        </Button>
      )}
    </section>
  )
}

export function HelpScreen({
  initialSection,
  onClose,
  onShowMe,
  onTour,
  onSetup,
  onShowChecklist
}: {
  /** The section to open at, usually the one for the current screen. */
  initialSection?: string | null
  onClose: () => void
  /** Null when no file is open: "Show me" needs one. */
  onShowMe: ((s: Screen) => void) | null
  onTour: () => void
  /** Null when the set-up steps cannot be used now (no file, read-only, demo). */
  onSetup: (() => void) | null
  /** Null unless the getting-started list was hidden for the open file. */
  onShowChecklist: (() => void) | null
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState(initialSection ?? guide.sections[0]?.id ?? '')
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const found = useMemo(
    () => guide.sections.filter((s) => words.every((w) => s.plain.includes(w))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query]
  )
  const section = found.find((s) => s.id === chosen) ?? found[0] ?? null
  const target = section ? SHOW_ME[section.id] : undefined

  return (
    <div className="w-full space-y-6 px-6 py-8" data-testid="help">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Guide</h1>
          <div className="mt-1 max-w-2xl text-ink-muted">
            <Blocks blocks={guide.intro} />
          </div>
        </div>
        <Button variant="secondary" onClick={onClose} data-testid="help-close">
          <X size={16} aria-hidden /> Close the guide
        </Button>
      </header>
      <StartAgain onTour={onTour} onSetup={onSetup} onShowChecklist={onShowChecklist} />
      <div className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="card overflow-hidden">
          <label className="flex items-center gap-2 border-b border-line px-4 py-3">
            <Search size={16} className="text-ink-muted" aria-hidden />
            <span className="sr-only">Search the guide</span>
            <input
              className="w-full bg-transparent outline-none placeholder:text-ink-muted"
              placeholder="Search, for example letters"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              data-testid="help-search"
            />
          </label>
          <nav aria-label="Guide sections" className="max-h-[65vh] overflow-y-auto p-2">
            {found.length === 0 && (
              <p className="p-3 text-sm text-ink-muted">Nothing matches. Try another word.</p>
            )}
            {found.map((s) => (
              <button
                key={s.id}
                onClick={() => setChosen(s.id)}
                aria-current={section?.id === s.id ? 'true' : undefined}
                ref={
                  section?.id === s.id
                    ? (el) => el?.scrollIntoView({ block: 'nearest' })
                    : undefined
                }
                className={cn(
                  'block w-full rounded-lg px-3 py-2 text-left text-sm',
                  section?.id === s.id ? 'bg-panel text-on-panel' : 'hover:bg-surface-muted'
                )}
              >
                {s.title}
              </button>
            ))}
          </nav>
        </div>
        {section && (
          <article className="card p-7" aria-labelledby="help-title">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 id="help-title" className="text-2xl font-semibold">
                {section.title}
              </h2>
              {target && onShowMe && (
                <Button size="sm" onClick={() => onShowMe(target)} data-testid="help-show-me">
                  Show me <ArrowRight size={15} aria-hidden />
                </Button>
              )}
            </div>
            <div className="mt-4 max-w-3xl">
              <Blocks blocks={section.blocks} />
            </div>
          </article>
        )}
      </div>
    </div>
  )
}
