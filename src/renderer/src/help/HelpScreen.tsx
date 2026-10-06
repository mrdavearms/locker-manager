import { useMemo, useState } from 'react'
import { ArrowRight, Search, X } from 'lucide-react'
import guideText from '../../../../docs/user-guide.md?raw'
import { Button } from '@renderer/components/Button'
import type { Screen } from '@renderer/components/NavRail'
import { cn } from '@renderer/lib/cn'
import { parseGuide, type Block, type Inline, type ListBlock } from '@shared/markdown'

// SPEC.md 10: the user guide in the app, searchable, with a "Show me" button on
// each task that opens the right screen. The text is docs/user-guide.md itself.

const guide = parseGuide(guideText)

/** Which screen each task lives on. Sections not listed have no button. */
const SHOW_ME: Record<string, Screen> = {
  'open-your-school-s-file': 'home',
  'see-your-lockers': 'lockers',
  'add-lockers': 'settings',
  'mark-a-locker-out-of-service-reserve-it-or-change-it': 'lockers',
  'renumber-a-locker': 'lockers',
  'change-the-kind-of-lock': 'settings',
  'set-up-your-school-first-time-only': 'setup',
  'add-your-school-s-logo': 'settings',
  'import-students': 'import',
  'check-names': 'students',
  'possible-leavers': 'students',
  'students-who-never-get-a-locker': 'students',
  'allocate-lockers-for-the-whole-year': 'allocate',
  'lock-codes-and-their-rules': 'settings-codes',
  'locks-to-reset': 'home',
  'undo-a-mistake': 'history',
  'print-locker-labels': 'print',
  'choose-and-measure-your-label-sheets': 'settings-labels',
  'line-up-your-printer-calibration-page': 'settings-labels',
  'change-the-label-layout': 'settings-labels',
  'print-letters': 'letters',
  'change-the-letter': 'settings-letters',
  'add-pictures-to-letters': 'settings-letters',
  'letters-in-other-languages': 'settings-letters',
  'lists-and-reports': 'reports',
  'export-the-whole-file': 'reports',
  'start-next-year': 'rollover',
  keys: 'lockers',
  'protect-codes-with-a-pin': 'settings-privacy',
  'text-size-dark-mode-and-high-contrast': 'settings-computer'
}

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

export function HelpScreen({
  onClose,
  onShowMe
}: {
  onClose: () => void
  /** Null when no file is open: "Show me" needs one. */
  onShowMe: ((s: Screen) => void) | null
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState(guide.sections[0]?.id ?? '')
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
